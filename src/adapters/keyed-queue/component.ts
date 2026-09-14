import { IKeyedQueueComponent } from './types'

/**
 * Creates a per-key serial queue: tasks under one key run in FIFO order, keys never block each
 * other, and a failed task neither blocks the next one nor hides its failure from its own
 * caller.
 *
 * Pure and process-local. Each consumer takes its own instance so their key spaces stay
 * independent: the cluster subscriber orders work per wallet, the LiveKit adapter orders
 * room-metadata writes per room.
 *
 * @returns The keyed queue component.
 */
export async function createKeyedQueueComponent(): Promise<IKeyedQueueComponent> {
  // Per key, the last queued task with its rejection swallowed, so a failure never stalls
  // what is queued behind it. The caller still sees that failure through `enqueue`'s result.
  const tails = new Map<string, Promise<unknown>>()

  function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve()
    const result = previous.then(task)
    const tail = result.catch(() => {})
    tails.set(key, tail)
    void tail.finally(() => {
      // Only when no newer task has taken the key over in the meantime.
      if (tails.get(key) === tail) {
        tails.delete(key)
      }
    })
    return result
  }

  function pending(): number {
    return tails.size
  }

  return { enqueue, pending }
}
