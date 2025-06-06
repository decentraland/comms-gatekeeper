import { FOUR_HOURS, FOUR_DAYS } from '../logic/time'
import { AppComponents, AddSceneStreamAccessInput, ISceneStreamAccessManager, SceneStreamAccess } from '../types'
import { StreamingAccessNotFoundError } from '../types/errors'
import SQL from 'sql-template-strings'

export async function createSceneStreamAccessManagerComponent({
  database,
  logs
}: Pick<AppComponents, 'database' | 'logs'>): Promise<ISceneStreamAccessManager> {
  const logger = logs.getLogger('scene-stream-access-manager')

  async function addAccess(input: AddSceneStreamAccessInput): Promise<SceneStreamAccess> {
    logger.debug('Adding stream access', { place_id: input.place_id })

    await database.query(
      SQL`UPDATE scene_stream_access 
          SET active = false 
          WHERE place_id = ${input.place_id} AND active = true`
    )

    const now = Date.now()

    const result = await database.query<SceneStreamAccess>(
      SQL`INSERT INTO scene_stream_access 
          (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active) 
          VALUES 
          (gen_random_uuid(), ${input.place_id}, ${input.streaming_key}, ${input.streaming_url}, ${input.ingress_id}, ${now}, true)
          RETURNING *`
    )

    return result.rows[0]
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
      SQL`SELECT id, place_id, streaming_key, streaming_url, ingress_id, created_at, active 
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

  async function getExpiredStreamingKeys(): Promise<Pick<SceneStreamAccess, 'ingress_id' | 'place_id'>[]> {
    const result = await database.query<Pick<SceneStreamAccess, 'ingress_id' | 'place_id'>>(
      SQL`SELECT ingress_id, place_id 
        FROM scene_stream_access 
        WHERE active = true 
          AND streaming = false 
          AND created_at < ${Date.now() - FOUR_DAYS}
        LIMIT 100`
    )
    return result.rows
  }

  async function startStreaming(ingressId: string): Promise<void> {
    const now = Date.now()
    const query = SQL`
      UPDATE scene_stream_access 
      SET streaming = true, streaming_start_time = ${now}
      WHERE ingress_id = ${ingressId} AND active = true
    `
    await database.query(query)
  }

  async function stopStreaming(ingressId: string): Promise<void> {
    const query = SQL`
      UPDATE scene_stream_access 
      SET streaming = false
      WHERE ingress_id = ${ingressId} AND active = true
    `
    await database.query(query)
  }

  async function isStreaming(ingressId: string): Promise<boolean> {
    const result = await database.query<SceneStreamAccess>(
      SQL`SELECT streaming FROM scene_stream_access WHERE ingress_id = ${ingressId} AND active = true LIMIT 1`
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
    const query = SQL`
      UPDATE scene_stream_access 
      SET active = false, streaming = false
      WHERE ingress_id = ${ingressId} AND active = true
    `
    await database.query(query)
  }

  return {
    addAccess,
    removeAccess,
    removeAccessByPlaceIds,
    getAccess,
    getExpiredStreamingKeys,
    startStreaming,
    stopStreaming,
    isStreaming,
    getExpiredStreamAccesses,
    killStreaming
  }
}
