import SQL from 'sql-template-strings'
import { AppComponents } from '../../types'
import { IPlayerConnectionDBComponent, PlayerConnectionInfo, UpsertPlayerConnectionInput } from './types'

const PLAYER_CONNECTION_SELECT_FIELDS = `address, ip_address as "ipAddress", device_id as "deviceId",
               created_at as "createdAt", updated_at as "updatedAt"`

export function createPlayerConnectionDBComponent(
  components: Pick<AppComponents, 'database' | 'logs'>
): IPlayerConnectionDBComponent {
  const { database } = components

  return {
    async upsertPlayerConnection({ address, ipAddress, deviceId }: UpsertPlayerConnectionInput): Promise<void> {
      const now = Date.now()
      // Store empty strings as null so the IP/device columns are either a usable value or
      // absent. An empty string would be persisted yet never match a ban (enforcement only
      // matches truthy identifiers), leaving inconsistent dead data.
      const query = SQL`
        INSERT INTO player_connection_info (address, ip_address, device_id, created_at, updated_at)
        VALUES (${address}, ${ipAddress || null}, ${deviceId || null}, ${now}, ${now})
        ON CONFLICT (address) DO UPDATE SET
          ip_address = EXCLUDED.ip_address,
          device_id = EXCLUDED.device_id,
          updated_at = EXCLUDED.updated_at`
      await database.query(query)
    },

    async getByAddress(address: string): Promise<PlayerConnectionInfo | null> {
      const query = SQL`SELECT `
        .append(PLAYER_CONNECTION_SELECT_FIELDS)
        .append(SQL` FROM player_connection_info WHERE address = ${address}`)

      const result = await database.query<PlayerConnectionInfo>(query)
      const row = result.rows[0]
      if (!row) {
        return null
      }

      // bigint columns come back as strings from pg.
      return { ...row, createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt) }
    }
  }
}
