import type { ConnectionBanQuery } from '../user-moderation/types'

/**
 * Cache key of one access-gate query: the lower-cased address and the device it was widened to.
 *
 * Shared with user moderation, which forgets an address's entries when its moderation state
 * changes, so the key shape lives in one place.
 */
export function accessGateCacheKey({ address, deviceId }: ConnectionBanQuery): string {
  return `${address.toLowerCase()}|${deviceId ?? ''}`
}

/** Glob matching every cached query for an address, whatever device it was widened to. */
export function accessGateCacheKeysOf(address: string): string {
  return `${address.toLowerCase()}|*`
}
