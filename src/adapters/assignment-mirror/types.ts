import { IBaseComponent } from '@well-known-components/interfaces'

export type IAssignmentMirrorComponent = IBaseComponent & {
  /**
   * @param wallet - The lower-cased wallet address.
   * @returns The cluster Pulse last assigned the wallet to, or `undefined` when none was seen
   * within the entry's lifetime.
   */
  get(wallet: string): string | undefined
  /**
   * Records the cluster Pulse assigned a wallet to, replacing any previous one and resetting
   * its TTL.
   *
   * @param wallet - The lower-cased wallet address.
   * @param clusterId - The cluster the wallet now belongs to.
   */
  set(wallet: string, clusterId: string): void
  /** Number of assignments currently held, expired entries excluded. */
  size(): number
}

export type AssignmentMirrorOptions = {
  /** Maximum number of wallets held before the LRU starts evicting. */
  max: number
  /** Entry lifetime in milliseconds. */
  ttl: number
}
