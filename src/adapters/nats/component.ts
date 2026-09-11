import { connect as natsConnect, ErrorCode, Events, NatsConnection, NatsError, QueuedIterator, Status } from 'nats'
import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { getErrorMessage } from '../../logic/errors'
import { AppComponents } from '../../types'
import { INatsComponent, NatsMessageHandler, NatsSubscribeOptions } from './types'

// Delay before retrying a failed connection. Mirrors Pulse's 5 s supervision loop.
const RECONNECT_DELAY_MS = 5000

type Registration = {
  subject: string
  handler: NatsMessageHandler
  queue?: string
}

/**
 * Creates a resilient, optional NATS client.
 *
 * Not @well-known-components/nats-component: that throws at boot on a missing URL, calls
 * process.exit(1) on disconnect, and exposes no metrics — wrong for an optional, resilient feed.
 *
 * Behaviour:
 * 1. With `NATS_URL` unset the component is inert — `connect()` logs and returns, `publish()`
 *    and `subscribe()` are harmless no-ops, and nothing about startup can fail.
 * 2. `subscribe()` records a registration and activates it immediately if a connection exists;
 *    otherwise `connect()` activates every pending registration once the link opens.
 * 3. Connection failures never propagate. They schedule a retry `RECONNECT_DELAY_MS` later and
 *    keep doing so until `[STOP_COMPONENT]` runs.
 *
 * @param components - The config, logs and metrics components.
 * @returns The NATS component. Its factory never throws, even with an unreachable broker.
 */
export async function createNatsComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'metrics'>
): Promise<INatsComponent> {
  const { config, logs, metrics } = components
  const logger = logs.getLogger('nats-adapter')

  const url = await config.getString('NATS_URL')

  const registrations: Registration[] = []
  let connection: NatsConnection | undefined
  // Handle on the status feed of the current connection, so it can be ended deliberately.
  // See monitorStatus for why holding this is not optional.
  let statusIterator: QueuedIterator<Status> | undefined
  // Real link state, unlike `connection` which stays set through a silent reconnect. Flips
  // false on Disconnect, true on Reconnect; isConnected() reports this, not object existence.
  let connected = false
  // In-flight connect() attempt, if any; lets overlapping calls share one natsConnect().
  let connectPromise: Promise<void> | undefined
  let retryTimer: NodeJS.Timeout | undefined
  let stopped = false

  // The flag and the gauge always move together; keeping them in one place is what stops the
  // two from drifting apart on any of the six paths that change link state.
  function setConnected(value: boolean): void {
    connected = value
    metrics.observe('dcl_gatekeeper_nats_connected', {}, value ? 1 : 0)
  }

  // Drops the connection handle so the next connect() opens a fresh one. nats.js owns
  // subscription bookkeeping, but NOT the status feed - that one is ours to end.
  function resetConnection(): void {
    statusIterator?.stop()
    statusIterator = undefined
    connection = undefined
    setConnected(false)
  }

  function activate(registration: Registration): void {
    if (!connection) {
      return
    }

    connection.subscribe(registration.subject, {
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
          logger.error(`Unhandled error in NATS handler for ${message.subject}: ${getErrorMessage(error)}`)
        }
      }
    })
  }

  function monitorStatus(nc: NatsConnection): void {
    // nats.js hands every status() caller its own iterator and never closes it when the
    // connection goes away - it only ever pushes into it. So this loop does NOT end on
    // drain/close: it parks on next() forever, keeping this closure and the dead connection
    // reachable from the client's listener list. Left alone that strands one loop per
    // connection, and the reconnect path builds a new one every time. resetConnection()
    // ends it; declared as QueuedIterator because status() is typed as the narrower
    // AsyncIterable, which hides the stop() the runtime object actually has.
    const iterator = nc.status() as QueuedIterator<Status>
    statusIterator = iterator

    // Drives the connected gauge and the `connected` flag together. nats.js restores
    // subscriptions itself across a reconnect, so there is nothing to re-establish here.
    void (async () => {
      try {
        for await (const status of iterator) {
          // Shutdown already settled the flag and the gauge; anything still in flight here is
          // the teardown itself, and reporting it as a fault would be misleading.
          if (stopped) {
            continue
          }

          if (status.type === Events.Disconnect) {
            setConnected(false)
            logger.warn(`NATS disconnected: ${String(status.data)}`)
          } else if (status.type === Events.Reconnect) {
            setConnected(true)
            logger.info(`NATS reconnected: ${String(status.data)}`)
          } else if (status.type === Events.Error) {
            logger.error(`NATS error: ${String(status.data)}`)
          }
        }
      } catch (error) {
        // stop(err) surfaces as a throw here. Caught rather than left to reject: this promise
        // is intentionally floating, and an unhandled rejection takes the process down.
        logger.error(`NATS status monitor ended with an error: ${getErrorMessage(error)}`)
      }
    })()

    // A permanent close should never happen with unlimited reconnect attempts, but if it
    // does, drop the handle and retry rather than leaving a dead connection in place.
    void nc
      .closed()
      .then((error) => {
        if (stopped) {
          return
        }
        logger.error(`NATS connection closed unexpectedly: ${error ? String(error) : 'no error reported'}`)
        resetConnection()
        scheduleRetry()
      })
      .catch((error) => {
        // Same reasoning as above: nothing awaits this chain, so a throw escaping the handler
        // would surface as an unhandled rejection rather than a logged failure.
        logger.error(`Error handling NATS connection close: ${getErrorMessage(error)}`)
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
        setConnected(false)
        return
      }

      connection = nc
      setConnected(true)
      logger.info(`Connected to NATS at ${url}`)

      monitorStatus(connection)

      for (const registration of registrations) {
        activate(registration)
      }
    } catch (error) {
      logger.error(
        `Failed to connect to NATS at ${url}: ${getErrorMessage(error)}. Retrying in ${RECONNECT_DELAY_MS}ms`
      )
      scheduleRetry()
    }
  }

  function subscribe(subject: string, handler: NatsMessageHandler, options?: NatsSubscribeOptions): void {
    const registration: Registration = { subject, handler, queue: options?.queue }
    registrations.push(registration)
    activate(registration)
  }

  function publish(subject: string, data: Uint8Array): boolean {
    // Checks `connection`, not isConnected(), on purpose: during a disconnect->reconnect blip
    // `connection` stays set and nats.js buffers writes against it, flushing on reconnect. Do
    // not swap in isConnected() - that would drop a write nats.js could have buffered.
    if (!connection) {
      return false
    }
    connection.publish(subject, data)
    return true
  }

  function isEnabled(): boolean {
    return !!url
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
        logger.error(`Error draining NATS connection during stop: ${getErrorMessage(error)}`)
      }
    }

    resetConnection()
  }

  return {
    connect,
    subscribe,
    publish,
    isEnabled,
    isConnected,
    [STOP_COMPONENT]: stop
  }
}
