import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents } from '../../types'
import { IKeyedQueueComponent } from './types'

const DEFAULT_DRAIN_TIMEOUT_MS = 5000

/**
 * Creates a per-key serial queue: tasks under one key run in FIFO order, keys never block each
 * other, and a failed task neither blocks the next one nor hides its failure from its own
 * caller.
 *
 * Process-local. Each consumer takes its own instance so their key spaces stay independent:
 * the cluster subscriber orders work per wallet, the LiveKit adapter orders room-metadata
 * writes per room.
 *
 * On stop it drains. Components stop in reverse creation order, so a queue created after the
 * connection its tasks publish on drains before that connection closes, and a mint or a
 * metadata write that is mid-flight at shutdown gets to finish. The wait is bounded by
 * `KEYED_QUEUE_DRAIN_TIMEOUT_MS`: the lifecycle has no stop timeout of its own, and a task stuck
 * on a request with no timeout would otherwise hold shutdown until the orchestrator kills the
 * process. Work queued after stop is still accepted; refusing it would gain nothing.
 *
 * @param components - The config and logs components.
 * @returns The keyed queue component.
 */
export async function createKeyedQueueComponent(
  components: Pick<AppComponents, 'config' | 'logs'>
): Promise<IKeyedQueueComponent> {
  const { config, logs } = components
  const logger = logs.getLogger('keyed-queue')

  // `??` on purpose: a configured 0 is a real value here, stop without waiting.
  const drainTimeoutMs = Math.max(
    0,
    (await config.getNumber('KEYED_QUEUE_DRAIN_TIMEOUT_MS')) ?? DEFAULT_DRAIN_TIMEOUT_MS
  )

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

  async function stop(): Promise<void> {
    const deadline = Date.now() + drainTimeoutMs

    // Re-checked per round: a task queued while a round was waiting, by a task in that round
    // or by a message still being delivered, is picked up by the next one.
    while (tails.size > 0) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        const keys = [...tails.keys()]
        logger.warn(
          `Gave up draining after ${drainTimeoutMs}ms with ${keys.length} key(s) still running: ${keys.slice(0, 10).join(', ')}`
        )
        return
      }

      let timer: NodeJS.Timeout | undefined
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, remaining)
      })
      try {
        await Promise.race([Promise.all([...tails.values()]), timeout])
      } finally {
        clearTimeout(timer)
      }
    }
  }

  return { enqueue, pending, [STOP_COMPONENT]: stop }
}
