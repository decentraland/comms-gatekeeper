/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BATCH_SIZE = 100

interface Place {
  id: string
  world: boolean
  world_name?: string
}

interface PlacesResponse {
  ok: boolean
  data: Place[]
}

/**
 * Migration to update world bans and admins to use world name as place_id instead of UUID.
 *
 * Background:
 * - Previously, world bans and admins were stored with the place_id being the UUID of the single
 *   scene that the world place had.
 * - Now, world place_ids are the lowercased world name (e.g., "myworld.dcl.eth") and world scene
 *   place_ids are auto-generated UUIDs.
 * - This migration automatically queries the Places API to determine which place_ids are worlds
 *   and updates them to use the world name instead.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  const placesApiUrl = process.env.PLACES_API_URL || 'https://places.decentraland.org/api'

  // Get all unique UUID place_ids from scene_bans and scene_admin
  const bansResult = await pgm.db.query("SELECT DISTINCT place_id FROM scene_bans WHERE place_id ~ '^[0-9a-f-]{36}$'")
  const adminsResult = await pgm.db.query(
    "SELECT DISTINCT place_id FROM scene_admin WHERE place_id ~ '^[0-9a-f-]{36}$'"
  )

  const allPlaceIds = new Set<string>()
  bansResult.rows.forEach((row: { place_id: string }) => allPlaceIds.add(row.place_id))
  adminsResult.rows.forEach((row: { place_id: string }) => allPlaceIds.add(row.place_id))

  console.log(`[Migration] Found ${allPlaceIds.size} unique UUID place_ids to check`)

  if (allPlaceIds.size === 0) {
    console.log('[Migration] No UUID place_ids found. No migration needed.')
    return
  }

  // Filter valid UUIDs
  const validPlaceIds = Array.from(allPlaceIds).filter((placeId) => {
    if (!UUID_REGEX.test(placeId)) {
      console.log(`[Migration] Skipping ${placeId} - not a valid UUID`)
      return false
    }
    return true
  })

  const mappings: Array<{ oldPlaceId: string; worldName: string }> = []

  // Query Places API in batches of 100
  for (let i = 0; i < validPlaceIds.length; i += BATCH_SIZE) {
    const batch = validPlaceIds.slice(i, i + BATCH_SIZE)
    console.log(`[Migration] Fetching batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} places)`)

    try {
      const response = await fetch(`${placesApiUrl}/places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch })
      })

      if (!response.ok) {
        throw new Error(`Places API returned HTTP ${response.status}`)
      }

      const result = (await response.json()) as PlacesResponse

      for (const place of result.data || []) {
        if (place.world && place.world_name) {
          console.log(`[Migration] ${place.id}: WORLD -> ${place.world_name}`)
          mappings.push({
            oldPlaceId: place.id,
            worldName: place.world_name.toLowerCase()
          })
        } else {
          console.log(`[Migration] ${place.id}: Not a world (regular place)`)
        }
      }
    } catch (error) {
      console.error(`[Migration] Error fetching batch from Places API:`, error)
      throw new Error(`Failed to fetch places batch from Places API`)
    }
  }

  console.log(`[Migration] Found ${mappings.length} world mappings to update`)

  if (mappings.length === 0) {
    console.log('[Migration] No world mappings found. No updates needed.')
    return
  }

  // Update scene_bans and scene_admin directly for each mapping
  for (const mapping of mappings) {
    const escapedOldPlaceId = mapping.oldPlaceId.replace(/'/g, "''")
    const escapedWorldName = mapping.worldName.replace(/'/g, "''")

    pgm.sql(`
      UPDATE scene_bans
      SET place_id = '${escapedWorldName}'
      WHERE place_id = '${escapedOldPlaceId}'
    `)

    pgm.sql(`
      UPDATE scene_admin
      SET place_id = '${escapedWorldName}'
      WHERE place_id = '${escapedOldPlaceId}'
    `)
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Note: Reverting this migration would require the inverse mapping (world_name -> old_place_id)
  // which is not stored. If you need to rollback, you'll need to restore from a backup.
  pgm.sql(`
    -- This migration cannot be automatically reverted.
    -- To rollback, restore the scene_bans and scene_admin tables from a backup.
    SELECT 1;
  `)
}
