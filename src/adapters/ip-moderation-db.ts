import SQL from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { IPgComponent } from '@well-known-components/pg-component'
import { IIpModerationDatabaseComponent, IpBan, IpBanStatus, CreateIpBanInput } from '../logic/ip-moderation/types'

const IP_BAN_SELECT_FIELDS = `id, banned_ip as "bannedIp", banned_by as "bannedBy", reason,
               custom_message as "customMessage", banned_at as "bannedAt", expires_at as "expiresAt",
               lifted_at as "liftedAt", lifted_by as "liftedBy", created_at as "createdAt"`

function activeIpBanFilter(now: Date = new Date()) {
  return SQL`lifted_at IS NULL AND (expires_at IS NULL OR expires_at > ${now})`
}

export function createIpModerationDBComponent(components: {
  database: IPgComponent
  logs: ILoggerComponent
}): IIpModerationDatabaseComponent {
  const { database } = components

  return {
    async banIp(input: CreateIpBanInput): Promise<IpBan> {
      const id = randomUUID()
      const now = new Date()

      const query = SQL`
        INSERT INTO ip_bans (id, banned_ip, banned_by, reason, custom_message, banned_at, expires_at, created_at)
        VALUES (${id}, ${input.bannedIp}, ${input.bannedBy}, ${input.reason}, ${input.customMessage ?? null}, ${now}, ${input.expiresAt ?? null}, ${now})
        RETURNING `.append(IP_BAN_SELECT_FIELDS)

      const result = await database.query<IpBan>(query)
      return result.rows[0]
    },

    async liftIpBan(ip: string, liftedBy: string): Promise<IpBan | null> {
      const now = new Date()

      const query = SQL`
        UPDATE ip_bans
        SET lifted_at = ${now}, lifted_by = ${liftedBy}
        WHERE banned_ip = ${ip}
          AND `
        .append(activeIpBanFilter())
        .append(` RETURNING `)
        .append(IP_BAN_SELECT_FIELDS)

      const result = await database.query<IpBan>(query)
      return result.rows[0] ?? null
    },

    async getIpBanStatus(ip: string): Promise<IpBanStatus> {
      const query = SQL`SELECT `
        .append(IP_BAN_SELECT_FIELDS)
        .append(SQL` FROM ip_bans WHERE banned_ip = ${ip} AND `)
        .append(activeIpBanFilter())

      const result = await database.query<IpBan>(query)
      if (result.rows.length > 0) {
        return { isBanned: true, ban: result.rows[0] }
      }
      return { isBanned: false }
    },

    async logConnection(address: string, ip: string): Promise<void> {
      const id = randomUUID()
      const now = new Date()

      const query = SQL`
        INSERT INTO connection_logs (id, address, ip, connected_at)
        VALUES (${id}, ${address}, ${ip}, ${now})`

      await database.query(query)
    },

    async getIpsByAddress(address: string): Promise<string[]> {
      const query = SQL`SELECT DISTINCT ip FROM connection_logs WHERE address = ${address}`

      const result = await database.query<{ ip: string }>(query)
      return result.rows.map((row) => row.ip)
    },

    async getAddressesByIp(ip: string): Promise<string[]> {
      const query = SQL`SELECT DISTINCT address FROM connection_logs WHERE ip = ${ip}`

      const result = await database.query<{ address: string }>(query)
      return result.rows.map((row) => row.address)
    }
  }
}
