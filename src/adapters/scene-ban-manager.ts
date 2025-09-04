import { AppComponents, SceneBan, AddSceneBanInput, ISceneBanManager } from '../types'
import SQL from 'sql-template-strings'

export async function createSceneBanManagerComponent({
  database,
  logs
}: Pick<AppComponents, 'database' | 'logs'>): Promise<ISceneBanManager> {
  const logger = logs.getLogger('scene-ban-manager')

  async function addBan(input: AddSceneBanInput): Promise<void> {
    const { place_id, banned_address, banned_by } = input

    const bannedAddressLowercase = banned_address.toLowerCase()
    const bannedByLowercase = banned_by.toLowerCase()

    const result = await database.query<SceneBan>(
      SQL`
        INSERT INTO scene_bans (
          id,
          place_id, 
          banned_address, 
          banned_by,
          banned_at
        )
        VALUES (
          gen_random_uuid(),
          ${place_id},
          ${bannedAddressLowercase},
          ${bannedByLowercase},
          ${Date.now()}
        )
        ON CONFLICT (place_id, banned_address)
        DO NOTHING
        RETURNING *;
      `
    )

    result.rowCount > 0
      ? logger.info(`New ban created (${bannedAddressLowercase}) for place ${place_id}`)
      : logger.info(`Ban already exists (${bannedAddressLowercase}) for place ${place_id}`)
    return
  }

  return {
    addBan
  }
}
