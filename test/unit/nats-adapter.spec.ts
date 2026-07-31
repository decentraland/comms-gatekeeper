import { connect as natsConnect, ErrorCode, NatsError } from 'nats'
import { createNatsComponent } from '../../src/adapters/nats'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createMetricsMockedComponent } from '../mocks/metrics-mock'
import { INatsComponent } from '../../src/types/nats.type'

jest.mock('nats', () => ({
  connect: jest.fn(),
  Events: { Disconnect: 'disconnect', Reconnect: 'reconnect', Error: 'error' },
  ErrorCode: { ConnectionClosed: 'CONNECTION_CLOSED' },
  NatsError: class NatsError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.code = code
    }
  }
}))

const natsConnectMock = natsConnect as jest.MockedFunction<typeof natsConnect>

type MockStatus = { type: string; data?: unknown }

/**
 * Awaits several microtask ticks. Needed after driving the controllable status/closed
 * mocks below, because monitorStatus's loop and close handler run detached (`void (async
 * () => ...)()`) - nothing in the test naturally awaits them, so a promise chain has to be
 * flushed by hand before asserting on its effects.
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

describe('nats-adapter', () => {
  let logs: ReturnType<typeof createLoggerMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let subscribeSpy: jest.Mock
  let publishSpy: jest.Mock
  let drainSpy: jest.Mock
  let closeSpy: jest.Mock
  let pushStatus: (status: MockStatus) => void
  let resolveClosed: (error: Error | undefined) => void

  function buildConnection() {
    subscribeSpy = jest.fn()
    publishSpy = jest.fn()
    drainSpy = jest.fn().mockResolvedValue(undefined)
    closeSpy = jest.fn().mockResolvedValue(undefined)

    // Controllable status iterator: next() hangs until pushStatus() feeds it, so tests
    // that never call pushStatus see the same never-resolving behaviour as before.
    const statusQueue: MockStatus[] = []
    let statusWaiting: ((result: IteratorResult<MockStatus>) => void) | undefined
    pushStatus = (status) => {
      const waiting = statusWaiting
      if (waiting) {
        statusWaiting = undefined
        waiting({ value: status, done: false })
      } else {
        statusQueue.push(status)
      }
    }

    // Controllable close promise: hangs until resolveClosed() is called, so tests that
    // never call it see the same never-resolving behaviour as before.
    const closedPromise = new Promise<Error | undefined>((resolve) => {
      resolveClosed = resolve
    })

    return {
      subscribe: subscribeSpy,
      publish: publishSpy,
      drain: drainSpy,
      close: closeSpy,
      status: jest.fn().mockReturnValue({
        [Symbol.asyncIterator]: () => ({
          next: (): Promise<IteratorResult<MockStatus>> => {
            const status = statusQueue.shift()
            if (status) {
              return Promise.resolve({ value: status, done: false })
            }
            return new Promise((resolve) => {
              statusWaiting = resolve
            })
          }
        })
      }),
      closed: jest.fn().mockReturnValue(closedPromise)
    }
  }

  async function build(natsUrl?: string): Promise<INatsComponent> {
    logs = createLoggerMockedComponent({})
    metrics = createMetricsMockedComponent({})
    const config = createConfigMockedComponent({
      getString: jest
        .fn()
        .mockImplementation((key: string) => Promise.resolve(key === 'NATS_URL' ? natsUrl : undefined))
    })
    return createNatsComponent({ config, logs, metrics } as any)
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when NATS_URL is not set', () => {
    it('should not connect, should report disconnected, and should make subscribe and publish no-ops', async () => {
      const nats = await build(undefined)
      nats.subscribe('some.subject', jest.fn())
      await nats.connect()

      expect(natsConnectMock).not.toHaveBeenCalled()
      expect(nats.isConnected()).toBe(false)
      expect(() => nats.publish('a.b', new Uint8Array([1]))).not.toThrow()
    })
  })

  describe('when NATS_URL is set', () => {
    describe('and subscriptions were registered before connecting', () => {
      it('should activate them on connect and set the connected gauge', async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        const nats = await build('localhost:4222')
        const handler = jest.fn()

        nats.subscribe('peer.*.cluster_change', handler, { queue: 'group-1' })
        await nats.connect()

        expect(nats.isConnected()).toBe(true)
        expect(subscribeSpy).toHaveBeenCalledWith(
          'peer.*.cluster_change',
          expect.objectContaining({ queue: 'group-1' })
        )
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 1)
      })
    })

    describe('and a message arrives', () => {
      it('should invoke the handler with the concrete subject and payload', async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        const nats = await build('localhost:4222')
        const handler = jest.fn()
        nats.subscribe('peer.*.cluster_change', handler)
        await nats.connect()

        const { callback } = subscribeSpy.mock.calls[0][1]
        callback(null, { subject: 'peer.0xabc.cluster_change', data: new Uint8Array([7]) })

        expect(handler).toHaveBeenCalledWith('peer.0xabc.cluster_change', new Uint8Array([7]))
      })
    })

    describe('and the handler throws', () => {
      it('should contain the throw so delivery on other subjects survives', async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        const nats = await build('localhost:4222')
        nats.subscribe('some.subject', () => {
          throw new Error('boom')
        })
        await nats.connect()

        const { callback } = subscribeSpy.mock.calls[0][1]

        expect(() => callback(null, { subject: 'some.subject', data: new Uint8Array() })).not.toThrow()
      })
    })

    describe('and the broker is unreachable at startup', () => {
      it('should not throw and should report disconnected', async () => {
        natsConnectMock.mockRejectedValue(new Error('ECONNREFUSED'))
        const nats = await build('localhost:4222')

        await expect(nats.connect()).resolves.toBeUndefined()
        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and the component is stopped', () => {
      it('should drain the connection and clear the connected gauge', async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        const nats = await build('localhost:4222')
        await nats.connect()

        await nats.stop!()

        expect(drainSpy).toHaveBeenCalled()
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 0)
        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and drain() rejects because the connection already closed underneath stop()', () => {
      it('should tolerate it and still resolve without throwing', async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        const nats = await build('localhost:4222')
        await nats.connect()

        drainSpy.mockRejectedValue(new NatsError('Connection closed', ErrorCode.ConnectionClosed))

        await expect(nats.stop!()).resolves.toBeUndefined()

        expect(nats.isConnected()).toBe(false)
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 0)
      })
    })

    describe('and the connection reports a disconnect and later a reconnect', () => {
      it('should drop the gauge and isConnected() on disconnect, and restore both on reconnect', async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        const nats = await build('localhost:4222')
        await nats.connect()

        expect(nats.isConnected()).toBe(true)

        pushStatus({ type: 'disconnect', data: 'connection lost' })
        await flushMicrotasks()

        expect(nats.isConnected()).toBe(false)
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 0)

        pushStatus({ type: 'reconnect', data: 'localhost:4222' })
        await flushMicrotasks()

        expect(nats.isConnected()).toBe(true)
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 1)
      })
    })

    describe('and the connection closes unexpectedly', () => {
      it('should clear the gauge and schedule a retry that reconnects with a fresh connection', async () => {
        jest.useFakeTimers()
        try {
          natsConnectMock.mockResolvedValueOnce(buildConnection() as any)
          // Capture this connection's own resolver before the next buildConnection() call
          // below overwrites the shared `resolveClosed` binding with the retry's resolver.
          const resolveFirstClosed = resolveClosed
          const nats = await build('localhost:4222')
          await nats.connect()
          expect(nats.isConnected()).toBe(true)

          natsConnectMock.mockResolvedValueOnce(buildConnection() as any)

          resolveFirstClosed(undefined)
          await flushMicrotasks()

          expect(nats.isConnected()).toBe(false)
          expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 0)
          expect(natsConnectMock).toHaveBeenCalledTimes(1)

          await jest.advanceTimersByTimeAsync(5000)

          expect(natsConnectMock).toHaveBeenCalledTimes(2)
          expect(nats.isConnected()).toBe(true)
        } finally {
          jest.useRealTimers()
        }
      })
    })

    describe('and the initial connect fails but a retry succeeds', () => {
      it('should reconnect once the retry delay elapses', async () => {
        jest.useFakeTimers()
        try {
          natsConnectMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
          natsConnectMock.mockResolvedValueOnce(buildConnection() as any)
          const nats = await build('localhost:4222')

          await nats.connect()
          expect(nats.isConnected()).toBe(false)
          expect(natsConnectMock).toHaveBeenCalledTimes(1)

          await jest.advanceTimersByTimeAsync(5000)

          expect(natsConnectMock).toHaveBeenCalledTimes(2)
          expect(nats.isConnected()).toBe(true)
        } finally {
          jest.useRealTimers()
        }
      })
    })

    describe('and stop() is called before connect() ever ran', () => {
      it('should resolve without throwing and report disconnected', async () => {
        const nats = await build('localhost:4222')

        await expect(nats.stop!()).resolves.toBeUndefined()
        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and stop() is called while a retry is pending', () => {
      it('should clear the retry timer so the pending attempt never reconnects', async () => {
        jest.useFakeTimers()
        try {
          natsConnectMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
          const nats = await build('localhost:4222')

          await nats.connect()
          expect(natsConnectMock).toHaveBeenCalledTimes(1)

          await nats.stop!()

          await jest.advanceTimersByTimeAsync(10000)

          expect(natsConnectMock).toHaveBeenCalledTimes(1)
          expect(nats.isConnected()).toBe(false)
        } finally {
          jest.useRealTimers()
        }
      })
    })

    describe('and connect() is called twice while the first attempt is still in flight', () => {
      it('should share the single connection attempt and activate every registration only once', async () => {
        let resolveConnect: (connection: unknown) => void = () => {}
        const pendingConnect = new Promise<unknown>((resolve) => {
          resolveConnect = resolve
        })
        natsConnectMock.mockReturnValue(pendingConnect as any)

        const nats = await build('localhost:4222')
        nats.subscribe('some.subject', jest.fn())

        const firstConnect = nats.connect()
        const secondConnect = nats.connect()

        const connection = buildConnection()
        resolveConnect(connection)

        await Promise.all([firstConnect, secondConnect])

        expect(natsConnectMock).toHaveBeenCalledTimes(1)
        expect(connection.subscribe).toHaveBeenCalledTimes(1)
      })
    })

    describe('and stop() runs while connect() is still awaiting natsConnect()', () => {
      it('should close the connection instead of activating it once the connect resolves', async () => {
        let resolveConnect: (connection: unknown) => void = () => {}
        const pendingConnect = new Promise<unknown>((resolve) => {
          resolveConnect = resolve
        })
        natsConnectMock.mockReturnValue(pendingConnect as any)

        const nats = await build('localhost:4222')
        nats.subscribe('some.subject', jest.fn())

        const connecting = nats.connect()

        // stop() lands here, before natsConnect() has resolved: `connection` is still
        // undefined, so it reports itself stopped without anything to close.
        await nats.stop!()

        const connection = buildConnection()
        resolveConnect(connection)

        await connecting

        expect(connection.close).toHaveBeenCalled()
        expect(connection.subscribe).not.toHaveBeenCalled()
        expect(nats.isConnected()).toBe(false)
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 0)
      })
    })
  })
})
