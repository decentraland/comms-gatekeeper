import { AppComponents, AddSceneStreamAccessInput, ISceneStreamAccessManager, SceneStreamAccess } from '../types'
import SQL from 'sql-template-strings'

export async function createSceneStreamAccessManagerComponent({
  database,
  logs
}: Pick<AppComponents, 'database' | 'logs'>): Promise<ISceneStreamAccessManager> {
  const logger = logs.getLogger('scene-stream-access-manager')

  async function addAccess(input: AddSceneStreamAccessInput): Promise<void> {
    logger.debug('Adding stream access', { place_id: input.place_id })

    await database.query(
      SQL`UPDATE scene_stream_access 
          SET active = false 
          WHERE place_id = ${input.place_id} AND active = true`
    )

    const now = Date.now()

    await database.query(
      SQL`INSERT INTO scene_stream_access 
          (id, place_id, streaming_key, streaming_url, created_at, active) 
          VALUES 
          (gen_random_uuid(), ${input.place_id}, ${input.streaming_key}, ${input.streaming_url}, ${now}, true)`
    )
  }

  async function removeAccess(placeId: string, adminAddress: string): Promise<void> {
    logger.debug('Removing stream access', { placeId, adminAddress })

    await database.query(
      SQL`UPDATE scene_stream_access 
          SET active = false 
          WHERE place_id = ${placeId} AND active = true`
    )
  }

  async function getAccess(placeId: string): Promise<SceneStreamAccess> {
    logger.debug('Getting stream access', { placeId })

    const result = await database.query<SceneStreamAccess>(
      SQL`SELECT id, place_id, streaming_key, streaming_url, created_at, active 
          FROM scene_stream_access 
          WHERE place_id = ${placeId} AND active = true 
          LIMIT 1`
    )

    if (result.rowCount === 0) {
      throw new Error(`No active streaming access found for place ${placeId}`)
    }

    return result.rows[0]
  }

  return {
    addAccess,
    removeAccess,
    getAccess
  }
}
