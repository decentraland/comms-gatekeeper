import { IBaseComponent } from '@well-known-components/interfaces'

/**
 * The assignment Pulse last published for the wallet: cluster and owning session ('' from an
 * older Pulse).
 */
export type MirrorEntry = { clusterId: string; session: string }

export type IAssignmentMirrorComponent = IBaseComponent & {
  /**
   * @param wallet - The lower-cased wallet address.
   * @returns The assignment Pulse last published for the wallet, or `undefined` when none was
   * seen within the entry's lifetime.
   */
  get(wallet: string): MirrorEntry | undefined
  /**
   * Records the assignment Pulse published for a wallet, replacing any previous one and
   * resetting its TTL.
   *
   * @param wallet - The lower-cased wallet address.
   * @param entry - The cluster and session to record.
   */
  set(wallet: string, entry: MirrorEntry): void
  /** Number of assignments currently held, expired entries excluded. */
  size(): number
}

export type AssignmentMirrorOptions = {
  /** Maximum number of wallets held before the LRU starts evicting. */
  max: number
  /** Entry lifetime in milliseconds. */
  ttl: number
}
