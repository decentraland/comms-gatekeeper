import { FOUR_DAYS, FOUR_HOURS } from '../logic/time'
import { AppComponents, AddSceneStreamAccessInput, ISceneStreamAccessManager, SceneStreamAccess } from '../types'
import { StreamingAccessNotFoundError } from '../types/errors'
import SQL from 'sql-template-strings'

// Matches an active stream-access row by ingress id, excluding the empty-ingress sentinel that
// Cast 2.0 rows use. Centralized so this safety-critical guard (a stray '' must never match — and
// mass-mutate — every active row) stays identical across all ingress-keyed queries.
function activeIngressCondition(ingressId: string) {
  return SQL`ingress_id = ${ingressId} AND ingress_id != '' AND active = true`
}

export async function createSceneStreamAccessManagerComponent({
  database,
  logs
}: Pick<AppComponents, 'database' | 'logs'>): Promise<ISceneStreamAccessManager> {
  const logger = logs.getLogger('scene-stream-access-manager')

  async function getActiveIngressIds(placeId: string): Promise<string[]> {
    const result = await database.query<Pick<SceneStreamAccess, 'ingress_id'>>(
      SQL`SELECT ingress_id FROM scene_stream_access WHERE place_id = ${placeId} AND active = true AND ingress_id IS NOT NULL AND ingress_id != ''`
    )
    return result.rows.map((row) => row.ingress_id)
  }

  async function addAccess(input: AddSceneStreamAccessInput): Promise<SceneStreamAccess> {
    logger.debug('Adding stream access', {
      place_id: input.place_id,
      room_id: input.room_id || 'none',
      generated_by: input.generated_by || 'none'
    })

    const pool = database.getPool()
    const client = await pool.connect()
    await client.query('BEGIN')

    try {
      await client.query(
        SQL`UPDATE scene_stream_access
            SET active = false, ingress_cleanup_pending = (ingress_id != '' AND ingress_id != ${input.ingress_id})
            WHERE place_id = ${input.place_id} AND active = true`
      )

      const now = Date.now()

      const result = await client.query<SceneStreamAccess>(
        SQL`INSERT INTO scene_stream_access
            (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, expiration_time, room_id, generated_by)
            VALUES
            (gen_random_uuid(), ${input.place_id}, ${input.streaming_key}, ${input.streaming_url}, ${input.ingress_id}, ${now}, true, ${input.expiration_time ?? null}, ${input.room_id || null}, ${input.generated_by || null})
            RETURNING *`
      )

      await client.query('COMMIT')
      return result.rows[0]
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async function removeAccess(placeId: string): Promise<void> {
    logger.debug('Removing stream access', { placeId })

    await database.query(
      SQL`UPDATE scene_stream_access 
          SET active = false 
          WHERE place_id = ${placeId} AND active = true`
    )
  }

  async function removeAccessByPlaceIds(placeIds: string[]): Promise<void> {
    logger.debug('Removing stream access', { placeIds: placeIds.join(', ') })

    const query = SQL`
      UPDATE scene_stream_access 
      SET active = false 
      WHERE place_id = ANY(${placeIds})
      AND active = true`

    await database.query(query)
  }

  async function getAccess(placeId: string): Promise<SceneStreamAccess> {
    logger.debug('Getting stream access', { placeId })

    const result = await database.query<SceneStreamAccess>(
      SQL`SELECT id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, expiration_time, room_id, generated_by
          FROM scene_stream_access 
          WHERE place_id = ${placeId} AND active = true 
          LIMIT 1`
    )

    if (result.rowCount === 0) {
      logger.debug('No active streaming access found for place', { placeId })
      throw new StreamingAccessNotFoundError('No active streaming access found for place')
    }
    return result.rows[0]
  }

  async function getAccessByStreamingKey(streamingKey: string): Promise<SceneStreamAccess | null> {
    logger.debug('Getting stream access by streaming key', { streamingKey: streamingKey.substring(0, 8) + '...' })

    const result = await database.query<SceneStreamAccess>(
      SQL`SELECT id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, streaming_start_time, expiration_time, room_id, generated_by
        FROM scene_stream_access
        WHERE streaming_key = ${streamingKey} AND active = true
        LIMIT 1`
    )

    if (result.rowCount === 0) {
      logger.debug('No active streaming access found for key')
      return null
    }

    return result.rows[0]
  }

  async function getAccessByRoomId(roomId: string, isWorldRoom = false): Promise<SceneStreamAccess | null> {
    logger.debug('Getting stream access by room ID', { roomId })

    // Keep the common lookup on the existing room_id index. Only legacy world rooms
    // need a case-insensitive fallback; Genesis IDs remain case-sensitive.
    let result = await database.query<SceneStreamAccess>(
      SQL`SELECT id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, streaming_start_time, expiration_time, room_id, generated_by
        FROM scene_stream_access
        WHERE active = true AND room_id = ${roomId}
        ORDER BY created_at DESC LIMIT 1`
    )
    if (result.rowCount === 0 && isWorldRoom) {
      result = await database.query<SceneStreamAccess>(
        SQL`SELECT id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, streaming_start_time, expiration_time, room_id, generated_by
          FROM scene_stream_access
          WHERE active = true AND lower(room_id) = lower(${roomId})
          ORDER BY created_at DESC LIMIT 1`
      )
    }

    if (result.rowCount === 0) {
      logger.debug('No active streaming access found for room ID')
      return null
    }

    return result.rows[0]
  }

  async function getLatestAccessByPlaceId(placeId: string): Promise<SceneStreamAccess | null> {
    logger.debug('Getting latest stream access by place ID', { placeId })

    const result = await database.query<SceneStreamAccess>(
      SQL`SELECT id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, streaming_start_time, expiration_time, room_id, generated_by
        FROM scene_stream_access
        WHERE place_id = ${placeId} AND active = true
        ORDER BY created_at DESC
        LIMIT 1`
    )

    if (result.rowCount === 0) {
      logger.debug('No active streaming access found for place')
      return null
    }

    return result.rows[0]
  }

  async function getExpiredStreamingKeys(): Promise<Pick<SceneStreamAccess, 'id' | 'ingress_id' | 'place_id'>[]> {
    const now = Date.now()
    // Separate indexed branches avoid an OR across the growing access history.
    // Retrying advances ready_at, so failing rows cannot monopolize the batch.
    const result = await database.query<Pick<SceneStreamAccess, 'id' | 'ingress_id' | 'place_id'>>(SQL`
      SELECT id, ingress_id, place_id FROM (
        (SELECT id, ingress_id, place_id, ingress_cleanup_retry_at AS ready_at FROM scene_stream_access
          WHERE ingress_cleanup_pending = true AND ingress_cleanup_retry_at <= ${now}
            AND ingress_cleanup_claim_until <= ${now}
          ORDER BY ingress_cleanup_retry_at, id LIMIT 100)
        UNION ALL
        (SELECT id, ingress_id, place_id, COALESCE(expiration_time, created_at + ${FOUR_DAYS}) AS ready_at
          FROM scene_stream_access
          WHERE active = true AND streaming = false AND ingress_cleanup_pending = false
            AND COALESCE(expiration_time, created_at + ${FOUR_DAYS}) <= ${now}
          ORDER BY COALESCE(expiration_time, created_at + ${FOUR_DAYS}), id LIMIT 100)
      ) candidates ORDER BY ready_at, id LIMIT 100
    `)
    return result.rows
  }

  async function claimExpiredAccess(id: string, claimToken: string): Promise<boolean> {
    const now = Date.now()
    const result = await database.query(SQL`
      UPDATE scene_stream_access SET active = false, ingress_cleanup_pending = true,
        ingress_cleanup_expired = (ingress_cleanup_expired OR active),
        ingress_cleanup_claim_token = ${claimToken},
        ingress_cleanup_claim_until = ${now + 5 * 60 * 1000},
        ingress_cleanup_retry_at = ${now + 10 * 60 * 1000}
      WHERE id = ${id} AND ingress_cleanup_claim_until <= ${now}
        AND ingress_cleanup_retry_at <= ${now} AND (
          ingress_cleanup_pending = true OR (
            active = true AND streaming = false AND COALESCE(expiration_time, created_at + ${FOUR_DAYS}) <= ${now}
          )
        ) RETURNING id
    `)
    return result.rowCount > 0
  }

  async function completeExpiredAccessCleanup(id: string, claimToken: string): Promise<boolean> {
    // Only the current lease holder may complete cleanup and send an expiry notification.
    // Replacement cleanup has ingress_cleanup_expired=false and never notifies.
    const result = await database.query<{ ingress_cleanup_expired: boolean }>(SQL`
      UPDATE scene_stream_access AS cleaned SET ingress_cleanup_pending = false, ingress_cleanup_claim_token = NULL,
        ingress_cleanup_claim_until = 0
      WHERE id = ${id} AND ingress_cleanup_claim_token = ${claimToken}
        AND ingress_cleanup_claim_until > ${Date.now()}
      RETURNING (ingress_cleanup_expired AND NOT EXISTS (
        SELECT 1 FROM scene_stream_access newer
        WHERE newer.place_id = cleaned.place_id AND newer.id != cleaned.id AND newer.created_at >= cleaned.created_at
      )) AS ingress_cleanup_expired
    `)
    return result.rows[0]?.ingress_cleanup_expired ?? false
  }

  async function startStreaming(ingressId: string): Promise<void> {
    const now = Date.now()
    const query = SQL`
      UPDATE scene_stream_access
      SET streaming = true, streaming_start_time = ${now}
      WHERE `.append(activeIngressCondition(ingressId))
    await database.query(query)
  }

  async function stopStreaming(ingressId: string): Promise<void> {
    const query = SQL`
      UPDATE scene_stream_access
      SET streaming = false
      WHERE `.append(activeIngressCondition(ingressId))
    await database.query(query)
  }

  async function isStreaming(ingressId: string): Promise<boolean> {
    const result = await database.query<SceneStreamAccess>(
      SQL`SELECT streaming FROM scene_stream_access WHERE `
        .append(activeIngressCondition(ingressId))
        .append(SQL` LIMIT 1`)
    )
    return result.rowCount > 0 && result.rows[0].streaming
  }

  async function getExpiredStreamAccesses(): Promise<
    Pick<SceneStreamAccess, 'streaming_start_time' | 'ingress_id' | 'place_id'>[]
  > {
    const result = await database.query<Pick<SceneStreamAccess, 'streaming_start_time' | 'ingress_id' | 'place_id'>>(
      SQL`
      SELECT streaming_start_time, ingress_id, place_id
      FROM scene_stream_access 
      WHERE active = true 
        AND streaming = true AND ${Date.now()} - streaming_start_time > ${FOUR_HOURS} 
      ORDER BY streaming_start_time DESC 
      LIMIT 100`
    )
    return result.rows
  }

  async function killStreaming(ingressId: string): Promise<void> {
    // Guard against ingress_id = '' (used by Cast 2.0 WebRTC rows): without it, a single call
    // with an empty id would deactivate every active Cast 2.0 stream access platform-wide.
    const query = SQL`
      UPDATE scene_stream_access
      SET active = false, streaming = false
      WHERE `.append(activeIngressCondition(ingressId))
    await database.query(query)
  }

  return {
    addAccess,
    removeAccess,
    removeAccessByPlaceIds,
    getAccess,
    getAccessByStreamingKey,
    getAccessByRoomId,
    getLatestAccessByPlaceId,
    getActiveIngressIds,
    getExpiredStreamingKeys,
    claimExpiredAccess,
    completeExpiredAccessCleanup,
    startStreaming,
    stopStreaming,
    isStreaming,
    getExpiredStreamAccesses,
    killStreaming
  }
}
