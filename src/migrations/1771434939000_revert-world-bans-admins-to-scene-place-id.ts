/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BATCH_SIZE = 100

interface WorldScene {
  entityId: string
  parcels: string[]
}

interface WorldScenesResponse {
  scenes: WorldScene[]
  total: number
}

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
 * - This migration reverts that: for each world name used as a place_id, it looks up all scenes
 *   in that world, resolves each scene's place UUID, and creates per-scene records.
 * - Existing world-name records are deleted after the scene-level records are created.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  const placesApiUrl = process.env.PLACES_API_URL || 'https://places.decentraland.org/api'
  const worldContentUrl = process.env.WORLD_CONTENT_URL || 'https://worlds-content-server.decentraland.org'

  // Find all non-UUID place_ids (world names) in scene_bans and scene_admin
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

    let scenes: WorldScene[]
    try {
      const response = await fetch(`${worldContentUrl}/world/${worldName}/scenes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pointers: [] })
      })

      if (!response.ok) {
        console.warn(`[Migration] Failed to fetch scenes for world ${worldName}: HTTP ${response.status}`)
        continue
      }

      const result = (await response.json()) as WorldScenesResponse
      scenes = result.scenes || []
    } catch (error) {
      console.error(`[Migration] Error fetching scenes for world ${worldName}:`, error)
      continue
    }

    if (scenes.length === 0) {
      console.log(`[Migration] No scenes found for world ${worldName}, skipping`)
      continue
    }

    console.log(`[Migration] Found ${scenes.length} scenes for world ${worldName}`)

    // For each scene, resolve its place UUID via the Places API
    const scenePlaceIds: string[] = []

    for (const scene of scenes) {
      if (!scene.parcels || scene.parcels.length === 0) {
        console.warn(`[Migration] Scene ${scene.entityId} has no parcels, skipping`)
        continue
      }

      const baseParcel = scene.parcels[0]
      try {
        const response = await fetch(
          `${placesApiUrl}/places?positions=${encodeURIComponent(baseParcel)}&names=${encodeURIComponent(worldName)}`
        )

        if (!response.ok) {
          console.warn(
            `[Migration] Failed to fetch place for scene at ${baseParcel} in ${worldName}: HTTP ${response.status}`
          )
          continue
        }

        const result = (await response.json()) as PlacesResponse

        if (!result.data || result.data.length === 0) {
          console.warn(`[Migration] No place found for scene at ${baseParcel} in ${worldName}`)
          continue
        }

        const place = result.data[0]
        if (UUID_REGEX.test(place.id)) {
          scenePlaceIds.push(place.id)
          console.log(`[Migration] Scene at ${baseParcel} -> place UUID ${place.id}`)
        } else {
          console.warn(`[Migration] Place ID ${place.id} for scene at ${baseParcel} is not a UUID, skipping`)
        }
      } catch (error) {
        console.error(`[Migration] Error fetching place for scene at ${baseParcel} in ${worldName}:`, error)
        continue
      }
    }

    if (scenePlaceIds.length === 0) {
      console.warn(`[Migration] No valid scene place IDs found for world ${worldName}, cleaning up world-name records`)
      const escapedWorldName = worldName.replace(/'/g, "''")
      pgm.sql(`DELETE FROM scene_bans WHERE place_id = '${escapedWorldName}'`)
      pgm.sql(`DELETE FROM scene_admin WHERE place_id = '${escapedWorldName}'`)
      continue
    }

    const escapedWorldName = worldName.replace(/'/g, "''")

    // Duplicate each ban record to every scene in the world
    for (const scenePlaceId of scenePlaceIds) {
      const escapedScenePlaceId = scenePlaceId.replace(/'/g, "''")

      pgm.sql(`
        INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
        SELECT gen_random_uuid(), '${escapedScenePlaceId}', banned_address, banned_by, banned_at
        FROM scene_bans
        WHERE place_id = '${escapedWorldName}'
          AND banned_address NOT IN (
            SELECT banned_address FROM scene_bans WHERE place_id = '${escapedScenePlaceId}'
          )
      `)

      pgm.sql(`
        INSERT INTO scene_admin (id, place_id, admin, added_by, created_at, active)
        SELECT gen_random_uuid(), '${escapedScenePlaceId}', admin, added_by, created_at, active
        FROM scene_admin
        WHERE place_id = '${escapedWorldName}'
          AND NOT (
            active = true
            AND admin IN (
              SELECT admin FROM scene_admin WHERE place_id = '${escapedScenePlaceId}' AND active = true
            )
          )
      `)
    }

    // Delete the original world-name records
    pgm.sql(`DELETE FROM scene_bans WHERE place_id = '${escapedWorldName}'`)
    pgm.sql(`DELETE FROM scene_admin WHERE place_id = '${escapedWorldName}'`)

    console.log(`[Migration] Completed migration for world ${worldName} -> ${scenePlaceIds.length} scenes`)
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
