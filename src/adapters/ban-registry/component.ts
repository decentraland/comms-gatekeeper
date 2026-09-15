import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { BanStatus, ConnectionBanQuery, UserBan } from '../../logic/user-moderation/types'
import { getErrorMessage } from '../../logic/errors'
import { AppComponents } from '../../types'
import { positiveNumberOr } from '../../utils/config'
import { BanRegistryNotLoadedError } from './errors'
import { IBanRegistryComponent } from './types'

const DEFAULT_REFRESH_MS = 60_000

/**
 * Creates the in-memory registry of active platform bans.
 *
 * Bans are few and slow-changing, and this service is what writes them, so the hot path reads
 * them from memory instead of the database: a lookup is a synchronous map probe, and a ban or
 * lift written through the decorated database component (`withBanRegistry`) is visible to the
 * very next lookup with no cache, no TTL and none of the races a time-based cache has to defend
 * against. Exact on a single replica, where the write and the lookup share the process.
 *
 * The contents are loaded at start and reloaded every `BAN_REGISTRY_REFRESH_MS`. The reload is
 * what covers a ban written behind the service's back and what retries a load that failed at
 * start; until a load has succeeded, `isLoaded()` is false and callers fall back to the database.
 * Expiry is honoured at lookup time, and an expired ban is dropped when it is met.
 *
 * @param components - The user moderation database, config and logs components.
 * @returns The ban registry component.
 */
export async function createBanRegistryComponent(
  components: Pick<AppComponents, 'userModerationDb' | 'config' | 'logs'>
): Promise<IBanRegistryComponent> {
  const { userModerationDb, config, logs } = components
  const logger = logs.getLogger('ban-registry')

  const refreshMs = positiveNumberOr(await config.getNumber('BAN_REGISTRY_REFRESH_MS'), DEFAULT_REFRESH_MS)

  let loaded = false
  let byId = new Map<string, UserBan>()
  let byAddress = new Map<string, UserBan[]>()
  let byDevice = new Map<string, UserBan[]>()
  let refreshTimer: NodeJS.Timeout | undefined

  function isActive(ban: UserBan, now: Date): boolean {
    return ban.liftedAt === null && (ban.expiresAt === null || ban.expiresAt > now)
  }

  function index(bans: UserBan[]): void {
    const nextById = new Map<string, UserBan>()
    const nextByAddress = new Map<string, UserBan[]>()
    const nextByDevice = new Map<string, UserBan[]>()
    for (const ban of bans) {
      nextById.set(ban.id, ban)
      const address = ban.bannedAddress.toLowerCase()
      nextByAddress.set(address, [...(nextByAddress.get(address) ?? []), ban])
      if (ban.bannedDeviceId) {
        nextByDevice.set(ban.bannedDeviceId, [...(nextByDevice.get(ban.bannedDeviceId) ?? []), ban])
      }
    }
    // Swapped in whole, so a lookup never sees a half-built index.
    byId = nextById
    byAddress = nextByAddress
    byDevice = nextByDevice
  }

  // The most recent active ban among the candidates, dropping the expired ones met on the way.
  function newestActive(candidates: UserBan[] | undefined, now: Date): UserBan | undefined {
    let newest: UserBan | undefined
    for (const ban of candidates ?? []) {
      if (!isActive(ban, now)) {
        remove(ban)
        continue
      }
      if (!newest || ban.bannedAt > newest.bannedAt) {
        newest = ban
      }
    }
    return newest
  }

  function getActiveBanForConnection({ address, deviceId }: ConnectionBanQuery): BanStatus {
    if (!loaded) {
      throw new BanRegistryNotLoadedError()
    }

    const now = new Date()
    // Own ban wins over a device match, as in the database query.
    const ban =
      newestActive(byAddress.get(address.toLowerCase()), now) ??
      (deviceId ? newestActive(byDevice.get(deviceId), now) : undefined)
    return ban ? { isBanned: true, ban } : { isBanned: false }
  }

  function add(ban: UserBan): void {
    if (byId.has(ban.id)) {
      return
    }
    byId.set(ban.id, ban)
    const address = ban.bannedAddress.toLowerCase()
    byAddress.set(address, [...(byAddress.get(address) ?? []), ban])
    if (ban.bannedDeviceId) {
      byDevice.set(ban.bannedDeviceId, [...(byDevice.get(ban.bannedDeviceId) ?? []), ban])
    }
  }

  function remove(ban: UserBan): void {
    if (!byId.delete(ban.id)) {
      return
    }
    const address = ban.bannedAddress.toLowerCase()
    const remainingForAddress = (byAddress.get(address) ?? []).filter((candidate) => candidate.id !== ban.id)
    if (remainingForAddress.length > 0) {
      byAddress.set(address, remainingForAddress)
    } else {
      byAddress.delete(address)
    }
    if (ban.bannedDeviceId) {
      const remainingForDevice = (byDevice.get(ban.bannedDeviceId) ?? []).filter((candidate) => candidate.id !== ban.id)
      if (remainingForDevice.length > 0) {
        byDevice.set(ban.bannedDeviceId, remainingForDevice)
      } else {
        byDevice.delete(ban.bannedDeviceId)
      }
    }
  }

  async function reload(): Promise<void> {
    const bans = await userModerationDb.getActiveBans()
    index(bans)
    loaded = true
  }

  async function refresh(): Promise<void> {
    try {
      await reload()
    } catch (error) {
      // The previous contents stay in place; a ban or lift made through this process reached
      // them already, and the next refresh tries again.
      logger.warn(`Cannot reload the active bans, keeping the current ones: ${getErrorMessage(error)}`)
    }
  }

  async function start(): Promise<void> {
    try {
      await reload()
      logger.info(`Ban registry loaded ${byId.size} active ban(s)`)
    } catch (error) {
      // Not fatal: lookups fall back to the database until the first successful refresh.
      logger.warn(`Cannot load the active bans, answering from the database until it works: ${getErrorMessage(error)}`)
    }

    refreshTimer = setInterval(() => void refresh(), refreshMs)
    refreshTimer.unref()
  }

  async function stop(): Promise<void> {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = undefined
    }
  }

  return {
    isLoaded: () => loaded,
    getActiveBanForConnection,
    add,
    remove,
    reload,
    [START_COMPONENT]: start,
    [STOP_COMPONENT]: stop
  }
}
