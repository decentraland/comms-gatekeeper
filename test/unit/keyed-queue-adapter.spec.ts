import { ILoggerComponent, STOP_COMPONENT } from '@well-known-components/interfaces'
import { createKeyedQueueComponent, IKeyedQueueComponent } from '../../src/adapters/keyed-queue'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createDeferred, flushMacrotask } from '../utils'

describe('keyed queue adapter', () => {
  let queue: IKeyedQueueComponent
  let logger: jest.Mocked<ILoggerComponent.ILogger>

  async function build(drainTimeoutMs?: number): Promise<IKeyedQueueComponent> {
    const config = createConfigMockedComponent({
      getNumber: jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key === 'KEYED_QUEUE_DRAIN_TIMEOUT_MS' ? drainTimeoutMs : undefined)
        )
    })
    const logs = createLoggerMockedComponent({})
    const component = await createKeyedQueueComponent({ config, logs })
    logger = logs.getLogger.mock.results[0].value

    return component
  }

  beforeEach(async () => {
    queue = await build()
  })

  describe('when two tasks are queued under the same key', () => {
    let first: ReturnType<typeof createDeferred<string>>
    let secondStarted: jest.Mock
    let firstResult: Promise<string>
    let secondResult: Promise<string>

    beforeEach(() => {
      first = createDeferred<string>()
      secondStarted = jest.fn()
      firstResult = queue.enqueue('wallet-a', () => first.promise)
      secondResult = queue.enqueue('wallet-a', async () => {
        secondStarted()
        return 'second'
      })
    })

    afterEach(() => {
      first.resolve('first')
    })

    it('should hold the second until the first settles', async () => {
      await flushMacrotask()

      expect(secondStarted).not.toHaveBeenCalled()
    })

    it('should count the key as pending while work is queued', () => {
      expect(queue.pending()).toBe(1)
    })

    describe('and the first settles', () => {
      beforeEach(async () => {
        first.resolve('first')
        await flushMacrotask()
      })

      it('should run the second', () => {
        expect(secondStarted).toHaveBeenCalled()
      })

      it('should resolve each caller with its own task value', async () => {
        await expect(firstResult).resolves.toBe('first')
        await expect(secondResult).resolves.toBe('second')
      })

      it('should drop the key once its queue drains', () => {
        expect(queue.pending()).toBe(0)
      })
    })
  })

  describe('when tasks are queued under different keys', () => {
    let first: ReturnType<typeof createDeferred<void>>
    let secondStarted: jest.Mock

    beforeEach(async () => {
      first = createDeferred<void>()
      secondStarted = jest.fn()
      void queue.enqueue('wallet-a', () => first.promise)
      void queue.enqueue('wallet-b', async () => {
        secondStarted()
      })
      await flushMacrotask()
    })

    afterEach(() => {
      first.resolve()
    })

    it('should run the second without waiting for the first', () => {
      expect(secondStarted).toHaveBeenCalled()
    })

    it('should drop the finished key while the running one stays pending', () => {
      expect(queue.pending()).toBe(1)
    })
  })

  describe('when a task rejects', () => {
    let failed: Promise<void>
    let nextStarted: jest.Mock
    let next: Promise<void>

    beforeEach(async () => {
      nextStarted = jest.fn()
      failed = queue.enqueue('wallet-a', async () => {
        throw new Error('boom')
      })
      next = queue.enqueue('wallet-a', async () => {
        nextStarted()
      })
      await Promise.allSettled([failed, next])
    })

    it('should reject its own caller with the error', async () => {
      await expect(failed).rejects.toThrow('boom')
    })

    it('should still run the task queued behind it', () => {
      expect(nextStarted).toHaveBeenCalled()
    })

    it('should resolve the caller of the task behind it', async () => {
      await expect(next).resolves.toBeUndefined()
    })

    it('should drop the key once its queue drains', () => {
      expect(queue.pending()).toBe(0)
    })
  })

  describe('when a task finishes while a newer one under its key is still running', () => {
    let first: ReturnType<typeof createDeferred<void>>
    let second: ReturnType<typeof createDeferred<void>>

    beforeEach(async () => {
      first = createDeferred<void>()
      second = createDeferred<void>()
      void queue.enqueue('wallet-a', () => first.promise)
      void queue.enqueue('wallet-a', () => second.promise)
      first.resolve()
      await flushMacrotask()
    })

    afterEach(() => {
      second.resolve()
    })

    it('should keep the key pending', () => {
      expect(queue.pending()).toBe(1)
    })
  })

  describe('when stopped with nothing queued', () => {
    it('should stop at once', async () => {
      await expect(queue[STOP_COMPONENT]!()).resolves.toBeUndefined()
    })
  })

  describe('when stopped while a task is still running', () => {
    let task: ReturnType<typeof createDeferred<void>>
    let stopped: jest.Mock
    let stopping: Promise<void>

    beforeEach(async () => {
      task = createDeferred<void>()
      stopped = jest.fn()
      void queue.enqueue('wallet-a', () => task.promise)

      stopping = queue[STOP_COMPONENT]!().then(() => stopped())
      await flushMacrotask()
    })

    afterEach(async () => {
      task.resolve()
      await stopping
    })

    it('should keep waiting for it', () => {
      expect(stopped).not.toHaveBeenCalled()
    })

    describe('and the task finishes', () => {
      beforeEach(async () => {
        task.resolve()
        await stopping
      })

      it('should finish stopping', () => {
        expect(stopped).toHaveBeenCalled()
      })

      it('should have drained every key', () => {
        expect(queue.pending()).toBe(0)
      })
    })
  })

  describe('when a task queues more work under its key during the drain', () => {
    let first: ReturnType<typeof createDeferred<void>>
    let second: ReturnType<typeof createDeferred<void>>
    let stopped: jest.Mock
    let stopping: Promise<void>

    beforeEach(async () => {
      first = createDeferred<void>()
      second = createDeferred<void>()
      stopped = jest.fn()
      void queue.enqueue('wallet-a', async () => {
        await first.promise
        void queue.enqueue('wallet-a', () => second.promise)
      })

      stopping = queue[STOP_COMPONENT]!().then(() => stopped())
      first.resolve()
      await flushMacrotask()
    })

    afterEach(async () => {
      second.resolve()
      await stopping
    })

    it('should keep waiting for the work queued during the drain', () => {
      expect(stopped).not.toHaveBeenCalled()
    })
  })

  describe('when a task outlives the drain deadline', () => {
    let task: ReturnType<typeof createDeferred<void>>

    beforeEach(async () => {
      queue = await build(50)
      task = createDeferred<void>()
      void queue.enqueue('wallet-a', () => task.promise)

      await queue[STOP_COMPONENT]!()
    })

    afterEach(() => {
      task.resolve()
    })

    it('should warn about the key it gave up on', () => {
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('wallet-a'))
    })

    it('should leave the key pending', () => {
      expect(queue.pending()).toBe(1)
    })
  })
})
