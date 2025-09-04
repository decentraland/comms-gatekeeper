import { AppComponents, SceneBan, AddSceneBanInput, ISceneBanManager } from '../types'
import SQL from 'sql-template-strings'

export function validateAddSceneBan(input: AddSceneBanInput): { valid: boolean; error?: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Input must be an object' }
  }

  const errors: string[] = []

  if (typeof input.place_id !== 'string') {
    errors.push('place_id is required and must be a string')
  }

  if (typeof input.banned_address !== 'string') {
    errors.push('banned_address is required and must be a string')
  }

  if (typeof input.banned_by !== 'string') {
    errors.push('banned_by is required and must be a string')
  }

  return { valid: errors.length === 0, error: errors.join(', ') }
}

export async function createSceneBanManagerComponent({
  database,
  logs
}: Pick<AppComponents, 'database' | 'logs'>): Promise<ISceneBanManager> {
  const logger = logs.getLogger('scene-ban-manager')

  async function addBan(input: AddSceneBanInput): Promise<void> {
    const validation = validateAddSceneBan(input)

    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const bannedAddressLowercase = input.banned_address.toLowerCase()
    const bannedByLowercase = input.banned_by.toLowerCase()

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
          ${input.place_id},
          ${bannedAddressLowercase},
          ${bannedByLowercase},
          ${Date.now()}
        )
        ON CONFLICT (place_id, banned_address) WHERE active = true
        DO NOTHING
        RETURNING *;
      `
    )

    result.rowCount > 0
      ? logger.info(`New ban created (${bannedAddressLowercase}) for place ${input.place_id}`)
      : logger.info(`Ban already exists (${bannedAddressLowercase}) for place ${input.place_id}`)
    return
  }

  return {
    addBan
  }
}
