import { IUserModerationDatabaseComponent } from '../../logic/user-moderation/types'
import { IBanRegistryComponent } from './types'

/**
 * Wraps the user-moderation database component so the ban registry sits between its callers
 * and the table.
 *
 * Writes go through and update the registry, so a ban or lift made through any path, user
 * moderation or a test seeding the adapter directly, is visible to the next lookup. A connection
 * lookup is answered from memory while the registry is loaded. A "not banned" answer is
 * trusted: it is the common case and what the registry exists to make free. A "banned" answer
 * is confirmed against the table first, so a ban lifted or deleted behind the service's back can
 * never keep a wallet out; the confirmation costs one read per event of a banned wallet, which
 * is rare, and it is the table's record that is returned. A ban written behind the service's
 * back is picked up by the registry's periodic reload.
 *
 * @param store - The database component that owns the SQL.
 * @param registry - The in-memory registry of active bans.
 * @returns A database component with the same surface.
 */
export function withBanRegistry(
  store: IUserModerationDatabaseComponent,
  registry: IBanRegistryComponent
): IUserModerationDatabaseComponent {
  return {
    ...store,

    async createBan(input) {
      const ban = await store.createBan(input)
      registry.add(ban)
      return ban
    },

    async liftBan(address, liftedBy) {
      const ban = await store.liftBan(address, liftedBy)
      if (ban) {
        registry.remove(ban)
      }
      return ban
    },

    async getActiveBanForConnection(query) {
      if (!registry.isLoaded()) {
        return store.getActiveBanForConnection(query)
      }

      const remembered = registry.getActiveBanForConnection(query)
      if (!remembered.isBanned || !remembered.ban) {
        return remembered
      }

      const confirmed = await store.getActiveBanForConnection(query)
      if (!confirmed.isBanned) {
        registry.remove(remembered.ban)
      }
      return confirmed
    }
  }
}
