import { createKeyedQueueComponent, IKeyedQueueComponent } from '../../src/adapters/keyed-queue'
import { createDeferred, flushMacrotask } from '../utils'

describe('keyed queue adapter', () => {
  let queue: IKeyedQueueComponent

  beforeEach(async () => {
    queue = await createKeyedQueueComponent()
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
})
