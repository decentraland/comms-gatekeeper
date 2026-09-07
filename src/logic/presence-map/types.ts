import { IBaseComponent } from '@well-known-components/interfaces'
import { ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'

/** A parcel coordinate pair, `[x, y]`. */
export type ParcelCoord = [number, number]

export type PresenceEntry = {
  /** Canonical (lower-cased) realm the peer stands in. */
  realm: string
  parcel: ParcelCoord
  /**
   * `server_name` of the Pulse instance that last wrote this entry, so a snapshot only replaces
   * what its own publisher owns. Primed entries carry `PRIME_SERVER_NAME`.
   */
  serverName: string
}

export type ParcelPeerCount = {
  parcel: ParcelCoord
  peersCount: number
}

export type IPresenceMapComponent = IBaseComponent & {
  /**
   * Whether the map holds a usable view of the world: false until either the boot-time prime
   * from Pulse succeeded or the first snapshot arrived on the feed. Callers that serve presence
   * answer `503 warming` while this is false rather than reporting an empty world.
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
}
