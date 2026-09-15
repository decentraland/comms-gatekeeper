import { IBaseComponent } from '@well-known-components/interfaces'
import { BanStatus, ConnectionBanQuery, UserBan } from '../../logic/user-moderation/types'

export type IBanRegistryComponent = IBaseComponent & {
  /** Whether the active bans are in memory, so lookups can be answered without the database. */
  isLoaded(): boolean
  /**
   * The active ban for a connection, answered as the database query would: an address match wins
   * over a device match, and the most recent ban wins within each. Expired bans never match.
   *
   * @param query - The address, plus the device id to widen the match to when known.
   * @returns The ban status, with the matching ban when there is one.
   * @throws {BanRegistryNotLoadedError} Until the active bans have been loaded.
   */
  getActiveBanForConnection(query: ConnectionBanQuery): BanStatus
  /**
   * Records a ban this process just created, so the very next lookup sees it.
   *
   * @param ban - The ban as persisted.
   */
  add(ban: UserBan): void
  /**
   * Forgets a ban this process just lifted.
   *
   * @param ban - The ban as persisted, lifted.
   */
  remove(ban: UserBan): void
  /** Replaces the contents with the database's active bans. Rejects when the query fails. */
  reload(): Promise<void>
}
