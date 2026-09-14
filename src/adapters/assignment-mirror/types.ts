import { IBaseComponent } from '@well-known-components/interfaces'

/**
 * The assignment Pulse last published for the wallet: cluster and owning session ('' from an
 * older Pulse), plus when this replica received it (`Date.now()`, ms). `receivedAt` is the
 * takeover's receipt second used to stamp a connect-path stale eviction (F2a,
 * docs/ai-agent-context.md) - never "now" at eviction time, so a retry cannot revoke a token
 * minted for the new session in between attempts. `displaced` is the rolling window of sessions
 * Pulse most recently named as displaced for this wallet - or that this replica inferred were
 * displaced, because a newer live session took their place (F4) - capped and oldest-dropped by
 * the writer; a `peer.{wallet}.connect` from one of them is parked instead of ignored, since its
 * ws socket may simply have dropped and re-handshook.
 */
export type MirrorEntry = { clusterId: string; session: string; receivedAt: number; displaced: string[] }

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
   * @param entry - The cluster, session, receipt time and displaced-session window to record.
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
