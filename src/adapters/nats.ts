import { connect as natsConnect, ErrorCode, Events, NatsConnection, NatsError, Subscription } from 'nats'
import { isErrorWithMessage } from '../logic/errors'
import { AppComponents } from '../types'
import { INatsComponent, NatsMessageHandler, NatsSubscribeOptions } from '../types/nats.type'

// Delay before retrying a failed connection. Mirrors Pulse's 5 s supervision loop.
const RECONNECT_DELAY_MS = 5000

type Registration = {
  subject: string
  handler: NatsMessageHandler
  queue?: string
}

// Not @well-known-components/nats-component: that throws at boot on a missing URL, calls
// process.exit(1) on disconnect, and exposes no metrics — wrong for an optional, resilient feed.
export async function createNatsComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'metrics'>
): Promise<INatsComponent> {
  const { config, logs, metrics } = components
  const logger = logs.getLogger('nats-adapter')

  const url = await config.getString('NATS_URL')

  const registrations: Registration[] = []
  const subscriptions: Subscription[] = []
  let connection: NatsConnection | undefined
  // Real link state, unlike `connection` which stays set through a silent reconnect. Flips
  // false on Disconnect, true on Reconnect; isConnected() reports this, not object existence.
  let connected = false
  // In-flight connect() attempt, if any; lets overlapping calls share one natsConnect().
  let connectPromise: Promise<void> | undefined
  let retryTimer: NodeJS.Timeout | undefined
  let stopped = false

  function activate(registration: Registration): void {
    if (!connection) {
      return
    }

    const subscription = connection.subscribe(registration.subject, {
      queue: registration.queue,
      callback: (err, message) => {
        if (err) {
          logger.error(`NATS subscription error on ${registration.subject}: ${err.message}`)
          return
        }

        // Second line of defence: an escaping throw here would unwind into the client's
        // reader loop and stop delivery on every subject on this connection, not just this one.
        try {
          registration.handler(message.subject, message.data)
        } catch (error) {
          logger.error(
            `Unhandled error in NATS handler for ${message.subject}: ${
              isErrorWithMessage(error) ? error.message : 'Unknown error'
            }`
          )
        }
      }
    })

    subscriptions.push(subscription)
  }

  function monitorStatus(nc: NatsConnection): void {
    // Drives the connected gauge and the `connected` flag together. nats.js restores
    // subscriptions itself across a reconnect, so there is nothing to re-establish here.
    void (async () => {
      for await (const status of nc.status()) {
        if (status.type === Events.Disconnect) {
          connected = false
          metrics.observe('dcl_gatekeeper_nats_connected', {}, 0)
          logger.warn(`NATS disconnected: ${String(status.data)}`)
        } else if (status.type === Events.Reconnect) {
          connected = true
          metrics.observe('dcl_gatekeeper_nats_connected', {}, 1)
          logger.info(`NATS reconnected: ${String(status.data)}`)
        } else if (status.type === Events.Error) {
          logger.error(`NATS error: ${String(status.data)}`)
        }
      }
    })()

    // A permanent close should never happen with unlimited reconnect attempts, but if it
    // does, drop the handle and retry rather than leaving a dead connection in place.
    void nc.closed().then((error) => {
      if (stopped) {
        return
      }
      logger.error(`NATS connection closed unexpectedly: ${error ? String(error) : 'no error reported'}`)
      connection = undefined
      connected = false
      subscriptions.length = 0
      metrics.observe('dcl_gatekeeper_nats_connected', {}, 0)
      scheduleRetry()
    })
  }

  function scheduleRetry(): void {
    if (stopped || retryTimer) {
      return
    }
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      void connect()
    }, RECONNECT_DELAY_MS)
  }

  async function connect(): Promise<void> {
    if (!url) {
      logger.info('NATS_URL is not set, NATS is disabled')
      return
    }
    if (connection || stopped) {
      return
    }

    // Coalesced so an explicit call racing a scheduleRetry()-driven one shares this attempt
    // instead of each opening a connection and activating every registration twice.
    if (!connectPromise) {
      connectPromise = attemptConnect().finally(() => {
        connectPromise = undefined
      })
    }

    return connectPromise
  }

  async function attemptConnect(): Promise<void> {
    try {
      const nc = await natsConnect({
        servers: url.split(',').map((server) => server.trim()),
        name: 'comms-gatekeeper',
        // Unlimited retries: the client default is 10 attempts, after which it gives up
        // permanently and the feed goes silent with the service still healthy.
        maxReconnectAttempts: -1,
        reconnectTimeWait: RECONNECT_DELAY_MS
      })

      // stop() can finish while we're awaiting above and find `connection` still undefined, so
      // it closes nothing. Recheck here, or we'd activate every subscription on a connection that leaks past shutdown.
      if (stopped) {
        await nc.close()
        metrics.observe('dcl_gatekeeper_nats_connected', {}, 0)
        return
      }

      connection = nc
      connected = true
      metrics.observe('dcl_gatekeeper_nats_connected', {}, 1)
      logger.info(`Connected to NATS at ${url}`)

      monitorStatus(connection)

      for (const registration of registrations) {
        activate(registration)
      }
    } catch (error) {
      logger.error(
        `Failed to connect to NATS at ${url}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }. Retrying in ${RECONNECT_DELAY_MS}ms`
      )
      scheduleRetry()
    }
  }

  function subscribe(subject: string, handler: NatsMessageHandler, options?: NatsSubscribeOptions): void {
    const registration: Registration = { subject, handler, queue: options?.queue }
    registrations.push(registration)
    activate(registration)
  }

  function publish(subject: string, data: Uint8Array): void {
    // Checks `connection`, not isConnected(), on purpose: during a disconnect->reconnect blip
    // `connection` stays set and nats.js buffers writes against it, flushing on reconnect. Do
    // not swap in isConnected() - that would drop a write nats.js could have buffered.
    if (!connection) {
      return
    }
    connection.publish(subject, data)
  }

  function isConnected(): boolean {
    return connected
  }

  async function stop(): Promise<void> {
    stopped = true

    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = undefined
    }

    if (!connection) {
      return
    }

    try {
      // drain() can reject with ConnectionClosed if stop() lands in the microtask gap between
      // the transport closing and monitorStatus's .then() clearing `connection` - expected, not a failure.
      await connection.drain()
    } catch (error) {
      if (error instanceof NatsError && error.code === ErrorCode.ConnectionClosed) {
        logger.info('NATS connection was already closed by the time stop() drained it')
      } else {
        logger.error(
          `Error draining NATS connection during stop: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
        )
      }
    }

    connection = undefined
    connected = false
    subscriptions.length = 0
    metrics.observe('dcl_gatekeeper_nats_connected', {}, 0)
  }

  return {
    connect,
    subscribe,
    publish,
    isConnected,
    stop
  }
}
