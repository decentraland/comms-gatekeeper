import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Place {
  id: string
  world: boolean
  world_name?: string
  base_position: string
}

interface PlacesResponse {
  ok: boolean
  data: Place[]
}

/**
 * Migration to revert world bans and admins from world-name-based place_ids back to scene UUIDs.
 *
 * Background:
 * - Migration 1770669236898 changed world bans/admins place_id from scene UUIDs to the
 *   lowercased world name (e.g., "myworld.dcl.eth"), making them world-wide.
 * - This migration reverts that: for each world name used as a place_id, it queries the Places API
 *   to get all scene places for that world, then creates per-scene records.
 * - Existing world-name records are deleted after the scene-level records are created.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  const placesApiUrl = process.env.PLACES_API_URL || 'https://places.decentraland.org/api'

  const bansResult = await pgm.db.query(
    "SELECT DISTINCT place_id FROM scene_bans WHERE place_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'"
  )
  const adminsResult = await pgm.db.query(
    "SELECT DISTINCT place_id FROM scene_admin WHERE place_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'"
  )

  const worldNames = new Set<string>()
  bansResult.rows.forEach((row: { place_id: string }) => worldNames.add(row.place_id))
  adminsResult.rows.forEach((row: { place_id: string }) => worldNames.add(row.place_id))

  console.log(`[Migration] Found ${worldNames.size} world-name place_ids to revert`)

  if (worldNames.size === 0) {
    console.log('[Migration] No world-name place_ids found. No migration needed.')
    return
  }

  for (const worldName of worldNames) {
    console.log(`[Migration] Processing world: ${worldName}`)

    let places: Place[]
    try {
      const response = await fetch(`${placesApiUrl}/places?names=${encodeURIComponent(worldName.toLowerCase())}`)

      if (!response.ok) {
        console.warn(`[Migration] Failed to fetch places for world ${worldName}: HTTP ${response.status}`)
        continue
      }

      const result = (await response.json()) as PlacesResponse
      places = (result.data || []).filter((p) => UUID_REGEX.test(p.id))
    } catch (error) {
      console.error(`[Migration] Error fetching places for world ${worldName}:`, error)
      continue
    }

    if (places.length === 0) {
      console.warn(`[Migration] No valid scene places found for world ${worldName}, cleaning up world-name records`)
      const escapedWorldName = worldName.replace(/'/g, "''")
      pgm.sql(`DELETE FROM scene_bans WHERE place_id = '${escapedWorldName}'`)
      pgm.sql(`DELETE FROM scene_admin WHERE place_id = '${escapedWorldName}'`)
      continue
    }

    console.log(`[Migration] Found ${places.length} scene places for world ${worldName}`)

    const escapedWorldName = worldName.replace(/'/g, "''")

    for (const place of places) {
      const escapedPlaceId = place.id.replace(/'/g, "''")
      console.log(`[Migration] Scene at ${place.base_position} -> place UUID ${place.id}`)

      pgm.sql(`
        INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
        SELECT gen_random_uuid(), '${escapedPlaceId}', banned_address, banned_by, banned_at
        FROM scene_bans
        WHERE place_id = '${escapedWorldName}'
          AND banned_address NOT IN (
            SELECT banned_address FROM scene_bans WHERE place_id = '${escapedPlaceId}'
          )
      `)

      pgm.sql(`
        INSERT INTO scene_admin (id, place_id, admin, added_by, created_at, active)
        SELECT gen_random_uuid(), '${escapedPlaceId}', admin, added_by, created_at, active
        FROM scene_admin
        WHERE place_id = '${escapedWorldName}'
          AND NOT (
            active = true
            AND admin IN (
              SELECT admin FROM scene_admin WHERE place_id = '${escapedPlaceId}' AND active = true
            )
          )
      `)
    }

    pgm.sql(`DELETE FROM scene_bans WHERE place_id = '${escapedWorldName}'`)
    pgm.sql(`DELETE FROM scene_admin WHERE place_id = '${escapedWorldName}'`)

    console.log(`[Migration] Completed migration for world ${worldName} -> ${places.length} scenes`)
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // The reverse of this migration is the original migration (1770669236898)
  // which converts scene UUIDs back to world names.
  // This cannot be done automatically without knowing which scene UUIDs belong to worlds.
  pgm.sql(`
    -- This migration cannot be automatically reverted.
    -- To rollback, restore the scene_bans and scene_admin tables from a backup
    -- or re-run migration 1770669236898.
    SELECT 1;
  `)
}
