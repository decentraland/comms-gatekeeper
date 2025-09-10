import { AppComponents, SceneBan, AddSceneBanInput, ISceneBanManager, ListBannedAddressesOptions } from '../types'
import SQL from 'sql-template-strings'

export async function createSceneBanManagerComponent({
  database,
  logs
}: Pick<AppComponents, 'database' | 'logs'>): Promise<ISceneBanManager> {
  const logger = logs.getLogger('scene-ban-manager')

  async function addBan(input: AddSceneBanInput): Promise<void> {
    const { placeId, bannedAddress, bannedBy } = input

    const bannedAddressLowercase = bannedAddress.toLowerCase()
    const bannedByLowercase = bannedBy.toLowerCase()

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
          ${placeId},
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
      ? logger.info(`New ban created (${bannedAddressLowercase}) for place ${placeId}`)
      : logger.info(`Ban already exists (${bannedAddressLowercase}) for place ${placeId}`)
    return
  }

  async function removeBan(placeId: string, bannedAddress: string): Promise<void> {
    const bannedAddressLowercase = bannedAddress.toLowerCase()

    const result = await database.query<SceneBan>(
      SQL`
        DELETE FROM scene_bans 
        WHERE place_id = ${placeId} 
        AND banned_address = ${bannedAddressLowercase}
        RETURNING *;
      `
    )

    result.rowCount > 0
      ? logger.info(`Ban removed (${bannedAddressLowercase}) for place ${placeId}`)
      : logger.info(`No ban found (${bannedAddressLowercase}) for place ${placeId}`)
    return
  }

  async function countBannedAddresses(placeId: string): Promise<number> {
    const countResult = await database.query<{ count: string }>(
      SQL`
        SELECT COUNT(*) as count FROM scene_bans
        WHERE place_id = ${placeId}
      `
    )
    const total = parseInt(countResult.rows[0].count)

    logger.debug(`Retrieved count ${total} banned addresses for place ${placeId}`)
    return total
  }

  async function listBannedAddresses(placeId: string, options?: ListBannedAddressesOptions): Promise<string[]> {
    const query = SQL`
      SELECT banned_address as "bannedAddress" FROM scene_bans
      WHERE place_id = ${placeId} 
      ORDER BY banned_at DESC
    `

    const { limit, offset } = options || {}

    if (limit) {
      query.append(SQL` LIMIT ${limit}`)
    }

    if (offset) {
      query.append(SQL` OFFSET ${offset}`)
    }

    const result = await database.query<{ bannedAddress: string }>(query)

    logger.debug(`Retrieved ${result.rowCount} banned addresses for place ${placeId}`)
    return result.rows.map((row) => row.bannedAddress)
  }

  async function isBanned(placeId: string, address: string): Promise<boolean> {
    const addressLowercase = address.toLowerCase()

    const result = await database.query<{ is_banned: boolean }>(
      SQL`
        SELECT EXISTS (
          SELECT id FROM scene_bans
          WHERE place_id = ${placeId} 
          AND banned_address = ${addressLowercase}
        ) as is_banned
      `
    )

    const isBanned = result.rows[0].is_banned
    logger.debug(`User ${addressLowercase} is ${isBanned ? 'banned' : 'not banned'} from place ${placeId}`)
    return isBanned
  }

  return {
    addBan,
    removeBan,
    countBannedAddresses,
    listBannedAddresses,
    isBanned
  }
}
