import { IBaseComponent } from '@well-known-components/interfaces'
import { ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'

/** A parcel coordinate pair, `[x, y]`. */
export type ParcelCoord = [number, number]

export type PresenceEntry = {
  /** Canonical (lower-cased) realm the peer stands in. */
  realm: string
  parcel: ParcelCoord
  /**
   * `server_name` of the Pulse instance that owns this entry, so a snapshot only replaces what
   * its own publisher owns. `undefined` while the entry is still only *primed*: the boot-time
   * `GET /peers?all=true` read is the all-instances list and carries no `server_name`, so there
   * is no publisher to attribute it to until one mentions the wallet.
   */
  serverName?: string
  /**
   * When the HTTP prime wrote this entry, for the `PRESENCE_PRIME_TTL_MS` expiry. Set only while
   * `serverName` is `undefined`; ownership replaces it.
   */
  primedAt?: number
}

export type ParcelPeerCount = {
  parcel: ParcelCoord
  peersCount: number
}

export type IPresenceMapComponent = IBaseComponent & {
  /**
   * Whether the map holds a usable view of the world *right now*: true only while a live source
   * stands behind it — a publisher that has sent a snapshot and has been heard from within
   * `PRESENCE_SERVER_TTL_MS`, or a boot-time prime younger than `PRESENCE_PRIME_TTL_MS`. It goes
   * back to false when the last publisher is presumed gone and the prime has expired, because the
   * same sweep that empties the map must stop it answering for the world: callers that serve
   * presence answer `503 warming` while this is false rather than reporting an empty one.
   */
  isReady(): boolean
  /** Number of wallets currently held. */
  size(): number
  /**
   * Feeds one decoded `engine.parcel_changes` batch through the C1 consumer rule.
   *
   * Never throws: a batch that cannot be reconciled (a sequence gap, an unknown publisher's
   * first delta) is skipped and the current state kept, because a stale map serves better than
   * no map. Public so the contract replay can drive the state machine directly.
   *
   * @param batch - The decoded batch.
   */
  applyBatch(batch: ParcelChangesBatch): void
  /**
   * @param address - The wallet address; matched case-insensitively.
   * @returns Where the peer stands, or `undefined` when it is not in the map.
   */
  get(address: string): PresenceEntry | undefined
  /**
   * @param realm - The realm name; matched case-insensitively.
   * @returns Every address in that realm, sorted ascending.
   */
  getAddressesInRealm(realm: string): string[]
  /**
   * @param realm - The realm name; matched case-insensitively.
   * @param parcels - Parcel keys in `"x,y"` form, as scene metadata spells them.
   * @returns Every address of that realm standing on one of those parcels, sorted ascending.
   */
  getAddressesInParcels(realm: string, parcels: string[]): string[]
  /**
   * @param realm - The realm name; matched case-insensitively.
   * @returns One entry per occupied parcel of that realm, with how many peers stand on it.
   */
  getParcelCounts(realm: string): ParcelPeerCount[]
  /**
   * @returns The `server_name`s whose deltas are being skipped while their next snapshot is
   * awaited, sorted ascending. Public so the contract replay can assert the pinned frozen set of
   * every step, which a map comparison alone cannot see (a frozen delta leaves the map as it is).
   */
  frozenServers(): string[]
  /**
   * Drops the state no publisher stands behind any more: primed entries no publisher re-asserted
   * within `PRESENCE_PRIME_TTL_MS`, and every entry (plus the `seq`) of a publisher that has sent
   * no batch for `PRESENCE_SERVER_TTL_MS`.
   *
   * Runs on a timer while the component is started; public so tests and operators can force one.
   */
  reclaim(): void
}
