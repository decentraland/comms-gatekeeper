import { IBaseComponent } from '@well-known-components/interfaces'

export type IKeyedQueueComponent = IBaseComponent & {
  /**
   * Runs `task` once every task queued earlier under `key` has settled. Tasks under different
   * keys run independently of each other.
   *
   * @param key - The serialization key.
   * @param task - The work to run when the key's earlier tasks have settled.
   * @returns The task's own outcome: resolves with its value, rejects with its error. A
   * rejection never holds up the tasks queued behind it.
   */
  enqueue<T>(key: string, task: () => Promise<T>): Promise<T>
  /** Number of keys with work queued or running. */
  pending(): number
}
