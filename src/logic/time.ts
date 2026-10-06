import { SceneStreamAccess } from '../types'

export const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000
export const FOUR_HOURS = 4 * 60 * 60 * 1000

/**
 * Returns the stored expiration, or the legacy four-day deadline used by the TTL cleanup job.
 * @param access - Stream access timestamps from the database.
 * @returns Expiration in milliseconds since the Unix epoch.
 */
export function getStreamAccessExpirationTime(
  access: Pick<SceneStreamAccess, 'expiration_time' | 'created_at'>
): number {
  return access.expiration_time ? Number(access.expiration_time) : Number(access.created_at) + FOUR_DAYS
}
