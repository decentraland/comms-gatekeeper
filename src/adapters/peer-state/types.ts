import { IBaseComponent } from '@well-known-components/interfaces'

export type PeerAssignment = {
  clusterId: string
  /** Stored rather than recomputed: `fromIslandId` needs the exact previous name. */
  room: string
  /** Kept for legibility in logs and debugging; the cache TTL does the actual expiry. */
  lastSeen: number
}

export type IPeerStateComponent = IBaseComponent & {
  /**
   * @param wallet - The lower-cased wallet address.
   * @returns The peer's last known assignment, or `undefined` when it was never stored or has expired.
   */
  get(wallet: string): PeerAssignment | undefined
  /**
   * Records a peer's current assignment, replacing any previous one and resetting its TTL.
   *
   * Only the `cluster_change` path may call this: it is the signal that decides which room a peer
   * is in. A `peer.*.connect` re-send reads the store but never writes it, because renewing the
   * TTL of an entry this replica may no longer own would make a superseded room permanent for a
   * client that keeps reconnecting.
   *
   * @param wallet - The lower-cased wallet address.
   * @param assignment - The assignment to store.
   */
  set(wallet: string, assignment: PeerAssignment): void
  /** Number of assignments currently held, expired entries excluded. */
  size(): number
}

export type PeerStateOptions = {
  /** Maximum number of wallets held before the LRU starts evicting. */
  max: number
  /** Entry lifetime in milliseconds. */
  ttl: number
}
