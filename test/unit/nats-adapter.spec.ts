import { connect as natsConnect, ErrorCode, NatsError } from 'nats'
import { ILoggerComponent, STOP_COMPONENT } from '@well-known-components/interfaces'
import { createNatsComponent, INatsComponent } from '../../src/adapters/nats'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createMetricsMockedComponent } from '../mocks/metrics-mock'

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
type MockConnection = ReturnType<typeof buildConnection>

let subscribeSpy: jest.Mock
let publishSpy: jest.Mock
let drainSpy: jest.Mock
let closeSpy: jest.Mock
let pushStatus: (status: MockStatus) => void
let pushStatusIgnoringStop: (status: MockStatus) => void
let failStatus: (error: Error) => void
let statusStopSpy: jest.Mock
let resolveClosed: (error: Error | undefined) => void
let rejectClosed: (error: Error) => void

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

function buildConnection() {
  subscribeSpy = jest.fn()
  publishSpy = jest.fn()
  drainSpy = jest.fn().mockResolvedValue(undefined)
  closeSpy = jest.fn().mockResolvedValue(undefined)

  // Controllable status iterator: next() hangs until pushStatus() feeds it, so tests
  // that never call pushStatus see the same never-resolving behaviour as before.
  // Mirrors nats.js's QueuedIterator, including the stop() the real one exposes but the
  // published `status(): AsyncIterable<Status>` signature hides - the adapter relies on it,
  // because the client itself never closes these iterators.
  const statusQueue: MockStatus[] = []
  let statusWaiting: ((result: IteratorResult<MockStatus>) => void) | undefined
  let statusRejecting: ((error: Error) => void) | undefined
  let statusStopped = false
  pushStatus = (status) => {
    if (statusStopped) {
      return
    }
    const waiting = statusWaiting
    if (waiting) {
      statusWaiting = undefined
      waiting({ value: status, done: false })
    } else {
      statusQueue.push(status)
    }
  }
  // Models the window stop() genuinely has: `stopped` is already true while drain() is still
  // awaited, so the iterator is live and can still deliver one last event into the loop.
  pushStatusIgnoringStop = (status) => {
    const waiting = statusWaiting
    if (waiting) {
      statusWaiting = undefined
      waiting({ value: status, done: false })
    } else {
      statusQueue.push(status)
    }
  }
  // The real QueuedIterator.stop(err) makes the for-await throw rather than complete.
  failStatus = (error) => {
    const waiting = statusRejecting
    if (waiting) {
      statusRejecting = undefined
      statusWaiting = undefined
      waiting(error)
    }
  }
  statusStopSpy = jest.fn(() => {
    statusStopped = true
    const waiting = statusWaiting
    if (waiting) {
      statusWaiting = undefined
      waiting({ value: undefined as never, done: true })
    }
  })

  // Controllable close promise: hangs until resolveClosed() is called, so tests that
  // never call it see the same never-resolving behaviour as before.
  const closedPromise = new Promise<Error | undefined>((resolve, reject) => {
    resolveClosed = resolve
    rejectClosed = reject
  })

  return {
    subscribe: subscribeSpy,
    publish: publishSpy,
    drain: drainSpy,
    close: closeSpy,
    status: jest.fn().mockReturnValue({
      stop: statusStopSpy,
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<MockStatus>> => {
          if (statusStopped) {
            return Promise.resolve({ value: undefined as never, done: true })
          }
          const status = statusQueue.shift()
          if (status) {
            return Promise.resolve({ value: status, done: false })
          }
          return new Promise((resolve, reject) => {
            statusWaiting = resolve
            statusRejecting = reject
          })
        }
      })
    }),
    closed: jest.fn().mockReturnValue(closedPromise)
  }
}

describe('nats-adapter', () => {
  let logs: ReturnType<typeof createLoggerMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let logger: jest.Mocked<ILoggerComponent.ILogger>
  let nats: INatsComponent

  async function build(natsUrl?: string): Promise<INatsComponent> {
    logs = createLoggerMockedComponent({})
    metrics = createMetricsMockedComponent({})
    const config = createConfigMockedComponent({
      getString: jest
        .fn()
        .mockImplementation((key: string) => Promise.resolve(key === 'NATS_URL' ? natsUrl : undefined))
    })
    const component = await createNatsComponent({ config, logs, metrics })
    // The component fetches its logger once, synchronously, before its first await.
    logger = logs.getLogger.mock.results[0].value

    return component
  }

  afterEach(async () => {
    // Any component built here can be holding a pending reconnect timer — a failed connect
    // schedules a real 5 s one. Stopping it clears that timer; left running, it fires into a
    // later test (or a later suite in the same worker) and calls the module mock long after
    // this test stopped configuring it.
    await nats?.[STOP_COMPONENT]?.()
    jest.clearAllMocks()
    // clearAllMocks does NOT drain mockResolvedValueOnce/mockRejectedValueOnce queues, and a
    // leftover once-value even takes precedence over the next test's mockReturnValue. Reset
    // the module mock outright so each test starts from an empty queue.
    natsConnectMock.mockReset()
  })

  describe('when NATS_URL is not set', () => {
    beforeEach(async () => {
      nats = await build(undefined)
      nats.subscribe('some.subject', jest.fn())
      await nats.connect()
    })

    it('should never reach the broker', () => {
      expect(natsConnectMock).not.toHaveBeenCalled()
    })

    it('should report itself disabled', () => {
      expect(nats.isEnabled()).toBe(false)
    })

    it('should report disconnected', () => {
      expect(nats.isConnected()).toBe(false)
    })

    it('should make publish a no-op instead of throwing', () => {
      expect(() => nats.publish('a.b', new Uint8Array([1]))).not.toThrow()
    })
  })

  describe('when NATS_URL is set', () => {
    describe('and subscriptions were registered before connecting', () => {
      let handler: jest.Mock

      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        handler = jest.fn()

        nats.subscribe('peer.*.cluster_change', handler, { queue: 'group-1' })
        await nats.connect()
      })

      it('should report itself enabled', () => {
        expect(nats.isEnabled()).toBe(true)
      })

      it('should report connected', () => {
        expect(nats.isConnected()).toBe(true)
      })

      it('should activate the registration with its queue group', () => {
        expect(subscribeSpy).toHaveBeenCalledWith(
          'peer.*.cluster_change',
          expect.objectContaining({ queue: 'group-1' })
        )
      })

      it('should set the connected gauge to 1', () => {
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 1)
      })
    })

    describe('and a message arrives', () => {
      let handler: jest.Mock

      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        handler = jest.fn()
        nats.subscribe('peer.*.cluster_change', handler)
        await nats.connect()
      })

      it('should invoke the handler with the concrete subject and payload', () => {
        const { callback } = subscribeSpy.mock.calls[0][1]
        callback(null, { subject: 'peer.0xabc.cluster_change', data: new Uint8Array([7]) })

        expect(handler).toHaveBeenCalledWith('peer.0xabc.cluster_change', new Uint8Array([7]))
      })
    })

    describe('and a message is published while connected', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()

        nats.publish('engine.peer.0xabc.island_changed', new Uint8Array([1, 2, 3]))
      })

      it('should hand the subject and payload to the connection unchanged', () => {
        expect(publishSpy).toHaveBeenCalledWith('engine.peer.0xabc.island_changed', new Uint8Array([1, 2, 3]))
      })

      it('should report the publish as delivered', () => {
        expect(nats.publish('a.b', new Uint8Array([1]))).toBe(true)
      })
    })

    describe('and a message is published with no connection', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()
        await nats[STOP_COMPONENT]!()
      })

      it('should report the publish as dropped rather than throwing', () => {
        // Silent here would be worse than a throw: callers reporting on delivery cannot tell
        // a dropped write from a delivered one without this.
        expect(nats.publish('a.b', new Uint8Array([1]))).toBe(false)
      })
    })

    describe('and a message is published during a disconnect blip', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()

        pushStatus({ type: 'disconnect', data: 'connection lost' })
        await flushMicrotasks()

        nats.publish('engine.peer.0xabc.island_changed', new Uint8Array([1]))
      })

      it('should still hand it to the connection, which buffers and flushes it on reconnect', () => {
        // Deliberately not gated on isConnected(): the handle survives the blip and nats.js
        // buffers writes against it. Dropping the write here would lose it outright.
        expect(publishSpy).toHaveBeenCalled()
      })
    })

    describe('and the subscription reports an error instead of a message', () => {
      let handler: jest.Mock

      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        handler = jest.fn()
        nats.subscribe('peer.*.cluster_change', handler)
        await nats.connect()

        const { callback } = subscribeSpy.mock.calls[0][1]
        callback(new Error('permissions violation'), undefined)
      })

      it('should not invoke the handler with a message it never received', () => {
        expect(handler).not.toHaveBeenCalled()
      })

      it('should log which subject failed', () => {
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('NATS subscription error on peer.*.cluster_change')
        )
      })
    })

    describe('and the handler throws', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        nats.subscribe('some.subject', () => {
          throw new Error('boom')
        })
        await nats.connect()
      })

      it('should contain the throw so delivery on other subjects survives', () => {
        const { callback } = subscribeSpy.mock.calls[0][1]

        expect(() => callback(null, { subject: 'some.subject', data: new Uint8Array() })).not.toThrow()
      })
    })

    describe('and the broker is unreachable at startup', () => {
      beforeEach(async () => {
        natsConnectMock.mockRejectedValue(new Error('ECONNREFUSED'))
        nats = await build('localhost:4222')
      })

      it('should resolve connect() instead of throwing', async () => {
        await expect(nats.connect()).resolves.toBeUndefined()
      })

      it('should report disconnected', async () => {
        await nats.connect()

        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and the component is stopped', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()
        await nats[STOP_COMPONENT]!()
      })

      it('should drain the connection', () => {
        expect(drainSpy).toHaveBeenCalled()
      })

      it('should clear the connected gauge', () => {
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 0)
      })

      it('should report disconnected', () => {
        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and the component is stopped while the status monitor is running', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()
        await nats[STOP_COMPONENT]!()
        await flushMicrotasks()
      })

      it('should end the status feed instead of leaving it parked on next() forever', () => {
        // nats.js never closes a status() iterator itself, so without this the loop outlives
        // the component and keeps the closed connection reachable.
        expect(statusStopSpy).toHaveBeenCalled()
      })

      it('should ignore a status event pushed once the feed is closed', async () => {
        pushStatus({ type: 'disconnect', data: 'teardown' })
        await flushMicrotasks()

        expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('NATS disconnected'))
      })

      it('should not let a late reconnect event resurrect the connected gauge', async () => {
        // Counted from here rather than asserted absolutely: the gauge legitimately went to 1
        // during the initial connect, so only a NEW rise after shutdown is a defect.
        const risesBefore = metrics.observe.mock.calls.filter(
          ([name, , value]) => name === 'dcl_gatekeeper_nats_connected' && value === 1
        ).length

        pushStatus({ type: 'reconnect', data: 'localhost:4222' })
        await flushMicrotasks()

        const risesAfter = metrics.observe.mock.calls.filter(
          ([name, , value]) => name === 'dcl_gatekeeper_nats_connected' && value === 1
        ).length

        expect(risesAfter).toBe(risesBefore)
        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and a status event arrives while shutdown is still draining', () => {
      let stopping: Promise<void>
      let resolveDrain: () => void

      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()

        // The genuine window: stop() sets `stopped` and then awaits drain(), so the status
        // feed is still live and can deliver one last event with shutdown already underway.
        drainSpy.mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              resolveDrain = resolve
            })
        )

        stopping = nats[STOP_COMPONENT]!()
        await flushMicrotasks()

        pushStatusIgnoringStop({ type: 'disconnect', data: 'draining' })
        await flushMicrotasks()
      })

      afterEach(async () => {
        // Let the deliberately-stalled shutdown finish, or the outer teardown's own stop()
        // would queue behind a drain that never resolves.
        resolveDrain()
        await stopping
      })

      it('should not report the teardown as a disconnect fault', () => {
        expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('NATS disconnected'))
      })

      it('should still complete the shutdown', async () => {
        resolveDrain()

        await expect(stopping).resolves.toBeUndefined()
        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and the status feed itself fails', () => {
      let onUnhandledRejection: jest.Mock

      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()

        onUnhandledRejection = jest.fn()
        process.on('unhandledRejection', onUnhandledRejection)

        failStatus(new Error('iterator aborted'))
        await flushMicrotasks()
      })

      afterEach(() => {
        process.off('unhandledRejection', onUnhandledRejection)
      })

      it('should log it', () => {
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('NATS status monitor ended with an error: iterator aborted')
        )
      })

      it('should not leave an unhandled rejection, which would take the process down', () => {
        expect(onUnhandledRejection).not.toHaveBeenCalled()
      })
    })

    describe('and closed() rejects instead of resolving', () => {
      let onUnhandledRejection: jest.Mock

      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()

        onUnhandledRejection = jest.fn()
        process.on('unhandledRejection', onUnhandledRejection)

        rejectClosed(new Error('transport exploded'))
        await flushMicrotasks()
      })

      afterEach(() => {
        process.off('unhandledRejection', onUnhandledRejection)
      })

      it('should log it rather than letting the floating chain reject', () => {
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error handling NATS connection close: transport exploded')
        )
      })

      it('should not leave an unhandled rejection', () => {
        expect(onUnhandledRejection).not.toHaveBeenCalled()
      })
    })

    describe('and the connection is replaced by the reconnect path', () => {
      let resolveFirstClosed: (error: Error | undefined) => void
      let firstStatusStop: jest.Mock

      beforeEach(async () => {
        jest.useFakeTimers()
        natsConnectMock.mockResolvedValueOnce(buildConnection() as any)
        resolveFirstClosed = resolveClosed
        firstStatusStop = statusStopSpy
        nats = await build('localhost:4222')
        await nats.connect()

        natsConnectMock.mockResolvedValueOnce(buildConnection() as any)
        resolveFirstClosed(new Error('server shutdown'))
        await flushMicrotasks()
        await jest.advanceTimersByTimeAsync(5000)
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should end the abandoned connection status feed rather than stranding one per reconnect', () => {
        expect(firstStatusStop).toHaveBeenCalled()
      })

      it('should be watching the replacement connection', () => {
        expect(nats.isConnected()).toBe(true)
      })
    })

    describe('and drain() rejects because the connection already closed underneath stop()', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()
        drainSpy.mockRejectedValue(new NatsError('Connection closed', ErrorCode.ConnectionClosed))
      })

      it('should tolerate it and still resolve without throwing', async () => {
        await expect(nats[STOP_COMPONENT]!()).resolves.toBeUndefined()
      })

      it('should still report disconnected and clear the gauge', async () => {
        await nats[STOP_COMPONENT]!()

        expect(nats.isConnected()).toBe(false)
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 0)
      })
    })

    describe('and drain() rejects for a reason other than the connection already being closed', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()
        drainSpy.mockRejectedValue(new Error('socket hang up'))
      })

      it('should not throw out of shutdown, which would abort the rest of it', async () => {
        await expect(nats[STOP_COMPONENT]!()).resolves.toBeUndefined()
      })

      it('should log it as a real failure rather than the expected-close case', async () => {
        await nats[STOP_COMPONENT]!()

        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Error draining NATS connection during stop: socket hang up')
        )
      })

      it('should still release the connection', async () => {
        await nats[STOP_COMPONENT]!()

        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and the connection reports a disconnect', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()

        pushStatus({ type: 'disconnect', data: 'connection lost' })
        await flushMicrotasks()
      })

      it('should report disconnected', () => {
        expect(nats.isConnected()).toBe(false)
      })

      it('should drop the connected gauge', () => {
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 0)
      })

      describe('and it later reconnects', () => {
        beforeEach(async () => {
          pushStatus({ type: 'reconnect', data: 'localhost:4222' })
          await flushMicrotasks()
        })

        it('should report connected again', () => {
          expect(nats.isConnected()).toBe(true)
        })

        it('should restore the connected gauge', () => {
          expect(metrics.observe).toHaveBeenLastCalledWith('dcl_gatekeeper_nats_connected', {}, 1)
        })
      })
    })

    describe('and the connection reports a transport error', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        await nats.connect()

        pushStatus({ type: 'error', data: 'stale connection' })
        await flushMicrotasks()
      })

      it('should log it', () => {
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('NATS error: stale connection'))
      })

      it('should stay connected, since an error is not a disconnect', () => {
        expect(nats.isConnected()).toBe(true)
      })
    })

    describe('and connect() is called again after it already succeeded', () => {
      beforeEach(async () => {
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        nats = await build('localhost:4222')
        nats.subscribe('some.subject', jest.fn())
        await nats.connect()
        await nats.connect()
      })

      it('should not open a second connection', () => {
        expect(natsConnectMock).toHaveBeenCalledTimes(1)
      })

      it('should not re-activate registrations, which would double-deliver every message', () => {
        expect(subscribeSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('and a second connect attempt fails while a retry is already pending', () => {
      beforeEach(async () => {
        jest.useFakeTimers()
        natsConnectMock.mockRejectedValue(new Error('ECONNREFUSED'))
        nats = await build('localhost:4222')

        await nats.connect()
        await nats.connect()
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should keep a single pending retry rather than stacking one per failure', async () => {
        expect(natsConnectMock).toHaveBeenCalledTimes(2)

        await jest.advanceTimersByTimeAsync(5000)

        // Three, not four: the second failure reused the timer the first one scheduled.
        expect(natsConnectMock).toHaveBeenCalledTimes(3)
      })
    })

    describe('and the connection closes as part of an orderly shutdown', () => {
      let resolveClosedAfterStop: (error: Error | undefined) => void

      beforeEach(async () => {
        jest.useFakeTimers()
        natsConnectMock.mockResolvedValue(buildConnection() as any)
        resolveClosedAfterStop = resolveClosed
        nats = await build('localhost:4222')
        await nats.connect()

        await nats[STOP_COMPONENT]!()
        // The transport's closed() settles after stop() has already run, which is the normal
        // ordering on a clean shutdown rather than an unexpected drop.
        resolveClosedAfterStop(undefined)
        await flushMicrotasks()
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should not report it as an unexpected close', () => {
        expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('closed unexpectedly'))
      })

      it('should not schedule a reconnect that would outlive the shutdown', async () => {
        natsConnectMock.mockClear()

        await jest.advanceTimersByTimeAsync(10000)

        expect(natsConnectMock).not.toHaveBeenCalled()
      })
    })

    describe('and the connection closes unexpectedly', () => {
      let resolveFirstClosed: (error: Error | undefined) => void
      let handler: jest.Mock

      beforeEach(async () => {
        jest.useFakeTimers()
        natsConnectMock.mockResolvedValueOnce(buildConnection() as any)
        // Capture this connection's own resolver before the next buildConnection() call
        // below overwrites the shared `resolveClosed` binding with the retry's resolver.
        resolveFirstClosed = resolveClosed
        nats = await build('localhost:4222')
        handler = jest.fn()
        nats.subscribe('peer.*.cluster_change', handler, { queue: 'group-1' })
        await nats.connect()
        // Also rebinds subscribeSpy to the replacement connection's own spy, so assertions
        // below see only what was activated on the reconnect, not the original connect.
        natsConnectMock.mockResolvedValueOnce(buildConnection() as any)
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      describe('and the retry has reconnected', () => {
        beforeEach(async () => {
          resolveFirstClosed(undefined)
          await flushMicrotasks()
          await jest.advanceTimersByTimeAsync(5000)
        })

        it('should re-establish every registration on the replacement connection', () => {
          // The failure this guards against is silent: without re-activation the adapter
          // reports itself connected and healthy while receiving nothing at all.
          expect(subscribeSpy).toHaveBeenCalledWith(
            'peer.*.cluster_change',
            expect.objectContaining({ queue: 'group-1' })
          )
        })

        it('should deliver messages to the original handler again', () => {
          const { callback } = subscribeSpy.mock.calls[0][1]
          callback(null, { subject: 'peer.0xabc.cluster_change', data: new Uint8Array([9]) })

          expect(handler).toHaveBeenCalledWith('peer.0xabc.cluster_change', new Uint8Array([9]))
        })

        it('should have opened a replacement connection', () => {
          expect(natsConnectMock).toHaveBeenCalledTimes(2)
        })

        it('should report connected again', () => {
          expect(nats.isConnected()).toBe(true)
        })
      })

      describe('and the retry delay has not elapsed yet', () => {
        beforeEach(async () => {
          resolveFirstClosed(undefined)
          await flushMicrotasks()
        })

        it('should report disconnected', () => {
          expect(nats.isConnected()).toBe(false)
        })

        it('should clear the connected gauge', () => {
          expect(metrics.observe).toHaveBeenLastCalledWith('dcl_gatekeeper_nats_connected', {}, 0)
        })

        it('should not have opened a replacement connection yet', () => {
          expect(natsConnectMock).toHaveBeenCalledTimes(1)
        })
      })

      describe('and the transport reported no error', () => {
        beforeEach(async () => {
          resolveFirstClosed(undefined)
          await flushMicrotasks()
        })

        it('should say no error was reported', () => {
          expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('NATS connection closed unexpectedly: no error reported')
          )
        })
      })

      describe('and the transport reported an error', () => {
        beforeEach(async () => {
          resolveFirstClosed(new Error('server shutdown'))
          await flushMicrotasks()
        })

        it('should surface it', () => {
          expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('NATS connection closed unexpectedly: Error: server shutdown')
          )
        })
      })
    })

    describe('and the initial connect fails but a retry succeeds', () => {
      beforeEach(async () => {
        jest.useFakeTimers()
        natsConnectMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
        natsConnectMock.mockResolvedValueOnce(buildConnection() as any)
        nats = await build('localhost:4222')
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should reconnect once the retry delay elapses', async () => {
        await nats.connect()
        expect(nats.isConnected()).toBe(false)
        expect(natsConnectMock).toHaveBeenCalledTimes(1)

        await jest.advanceTimersByTimeAsync(5000)

        expect(natsConnectMock).toHaveBeenCalledTimes(2)
        expect(nats.isConnected()).toBe(true)
      })
    })

    describe('and stop() is called before connect() ever ran', () => {
      beforeEach(async () => {
        nats = await build('localhost:4222')
      })

      it('should resolve without throwing', async () => {
        await expect(nats[STOP_COMPONENT]!()).resolves.toBeUndefined()
      })

      it('should report disconnected', async () => {
        await nats[STOP_COMPONENT]!()

        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and stop() is called while a retry is pending', () => {
      beforeEach(async () => {
        jest.useFakeTimers()
        natsConnectMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
        nats = await build('localhost:4222')
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should clear the retry timer so the pending attempt never reconnects', async () => {
        await nats.connect()
        expect(natsConnectMock).toHaveBeenCalledTimes(1)

        await nats[STOP_COMPONENT]!()

        await jest.advanceTimersByTimeAsync(10000)

        expect(natsConnectMock).toHaveBeenCalledTimes(1)
        expect(nats.isConnected()).toBe(false)
      })
    })

    describe('and connect() is called twice while the first attempt is still in flight', () => {
      let resolveConnect: (connection: unknown) => void
      let connection: MockConnection

      beforeEach(async () => {
        resolveConnect = () => {}
        const pendingConnect = new Promise<unknown>((resolve) => {
          resolveConnect = resolve
        })
        natsConnectMock.mockReturnValue(pendingConnect as any)

        nats = await build('localhost:4222')
        nats.subscribe('some.subject', jest.fn())

        const firstConnect = nats.connect()
        const secondConnect = nats.connect()

        connection = buildConnection()
        resolveConnect(connection)

        await Promise.all([firstConnect, secondConnect])
      })

      it('should share the single connection attempt', () => {
        expect(natsConnectMock).toHaveBeenCalledTimes(1)
      })

      it('should activate every registration only once', () => {
        expect(connection.subscribe).toHaveBeenCalledTimes(1)
      })
    })

    describe('and stop() runs while connect() is still awaiting natsConnect()', () => {
      let resolveConnect: (connection: unknown) => void
      let connection: MockConnection

      beforeEach(async () => {
        resolveConnect = () => {}
        const pendingConnect = new Promise<unknown>((resolve) => {
          resolveConnect = resolve
        })
        natsConnectMock.mockReturnValue(pendingConnect as any)

        nats = await build('localhost:4222')
        nats.subscribe('some.subject', jest.fn())

        const connecting = nats.connect()

        // stop() lands here, before natsConnect() has resolved: `connection` is still
        // undefined, so it reports itself stopped without anything to close.
        await nats[STOP_COMPONENT]!()

        connection = buildConnection()
        resolveConnect(connection)

        await connecting
      })

      it('should close the connection that resolved after shutdown', () => {
        expect(connection.close).toHaveBeenCalled()
      })

      it('should not activate any registration on it', () => {
        expect(connection.subscribe).not.toHaveBeenCalled()
      })

      it('should report disconnected with the gauge cleared', () => {
        expect(nats.isConnected()).toBe(false)
        expect(metrics.observe).toHaveBeenCalledWith('dcl_gatekeeper_nats_connected', {}, 0)
      })
    })
  })
})
