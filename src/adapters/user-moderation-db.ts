import SQL from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { IPgComponent } from '@well-known-components/pg-component'
import {
  IUserModerationDatabaseComponent,
  UserBan,
  UserWarning,
  BanStatus,
  CreateBanInput,
  CreateWarningInput,
  ConnectionBanQuery
} from '../logic/user-moderation/types'
import { PlayerAlreadyBannedError } from '../logic/user-moderation/errors'

const BAN_SELECT_FIELDS = `id, banned_address as "bannedAddress", banned_by as "bannedBy", reason,
               custom_message as "customMessage", banned_device_id as "bannedDeviceId",
               banned_at as "bannedAt", expires_at as "expiresAt",
               lifted_at as "liftedAt", lifted_by as "liftedBy", created_at as "createdAt"`

function activeBanFilter(now: Date = new Date()) {
  return SQL`lifted_at IS NULL AND (expires_at IS NULL OR expires_at > ${now})`
}

const WARNING_SELECT_FIELDS = `id, warned_address as "warnedAddress", warned_by as "warnedBy", reason,
               warned_at as "warnedAt", created_at as "createdAt"`

export function createUserModerationDBComponent(components: {
  database: IPgComponent
  logs: ILoggerComponent
}): IUserModerationDatabaseComponent {
  const { database } = components

  return {
    async createBan(input: CreateBanInput): Promise<UserBan> {
      const id = randomUUID()
      const now = new Date()

      // There is no DB-level uniqueness constraint on active bans (a partial unique index on
      // `lifted_at IS NULL` would wrongly block re-banning a user whose previous ban expired),
      // so guard the check-then-insert with a transaction-scoped advisory lock keyed on the
      // address. This serializes concurrent bans for the same address cluster-wide and prevents
      // two moderators from creating duplicate active-ban rows via a TOCTOU race.
      const pool = database.getPool()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(SQL`SELECT pg_advisory_xact_lock(hashtext(${input.bannedAddress}))`)

        const existing = await client.query<UserBan>(
          SQL`SELECT id FROM user_bans WHERE banned_address = ${input.bannedAddress} AND `.append(activeBanFilter(now))
        )
        if (existing.rows.length > 0) {
          // Throw without committing: the ROLLBACK in catch cleanly ends this write-free
          // transaction and releases the advisory lock (a COMMIT-then-throw would leave the
          // catch issuing a ROLLBACK against an already-finished transaction).
          throw new PlayerAlreadyBannedError(input.bannedAddress)
        }

        const result = await client.query<UserBan>(
          SQL`
        INSERT INTO user_bans (id, banned_address, banned_by, reason, custom_message, banned_device_id, banned_at, expires_at, created_at)
        VALUES (${id}, ${input.bannedAddress}, ${input.bannedBy}, ${input.reason}, ${input.customMessage ?? null}, ${input.bannedDeviceId ?? null}, ${now}, ${input.expiresAt ?? null}, ${now})
        RETURNING `.append(BAN_SELECT_FIELDS)
        )

        await client.query('COMMIT')
        return result.rows[0]
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async liftBan(address: string, liftedBy: string): Promise<UserBan | null> {
      const now = new Date()

      const query = SQL`
        UPDATE user_bans
        SET lifted_at = ${now}, lifted_by = ${liftedBy}
        WHERE banned_address = ${address}
          AND `
        .append(activeBanFilter())
        .append(` RETURNING `)
        .append(BAN_SELECT_FIELDS)

      const result = await database.query<UserBan>(query)
      return result.rows[0] ?? null
    },

    async isPlayerBanned(address: string): Promise<BanStatus> {
      const query = SQL`SELECT `
        .append(BAN_SELECT_FIELDS)
        .append(SQL` FROM user_bans WHERE banned_address = ${address} AND `)
        .append(activeBanFilter())

      const result = await database.query<UserBan>(query)
      if (result.rows.length > 0) {
        return { isBanned: true, ban: result.rows[0] }
      }
      return { isBanned: false }
    },

    async getActiveBanForConnection({ address, deviceId }: ConnectionBanQuery): Promise<BanStatus> {
      // Match an active ban by address OR by the captured device id, so a banned player is
      // rejected even when reconnecting from the same device under a different wallet. The
      // device term is only added when provided (a null term must not match null rows).
      const identifierMatch = SQL`banned_address = ${address}`
      if (deviceId) {
        identifierMatch.append(SQL` OR banned_device_id = ${deviceId}`)
      }

      const query = SQL`SELECT `
        .append(BAN_SELECT_FIELDS)
        .append(SQL` FROM user_bans WHERE (`)
        .append(identifierMatch)
        .append(SQL`) AND `)
        .append(activeBanFilter())
        .append(SQL` LIMIT 1`)

      const result = await database.query<UserBan>(query)
      if (result.rows.length > 0) {
        return { isBanned: true, ban: result.rows[0] }
      }
      return { isBanned: false }
    },

    async getActiveBans(): Promise<UserBan[]> {
      const query = SQL`SELECT `
        .append(BAN_SELECT_FIELDS)
        .append(` FROM user_bans WHERE `)
        .append(activeBanFilter())
        .append(` ORDER BY banned_at DESC`)

      const result = await database.query<UserBan>(query)
      return result.rows
    },

    async createWarning(input: CreateWarningInput): Promise<UserWarning> {
      const id = randomUUID()

      const now = new Date()

      const query = SQL`
        INSERT INTO user_warnings (id, warned_address, warned_by, reason, warned_at, created_at)
        VALUES (${id}, ${input.warnedAddress}, ${input.warnedBy}, ${input.reason}, ${now}, ${now})
        RETURNING `.append(WARNING_SELECT_FIELDS)

      const result = await database.query<UserWarning>(query)
      return result.rows[0]
    },

    async getPlayerWarnings(address: string): Promise<UserWarning[]> {
      const query = SQL`SELECT `
        .append(WARNING_SELECT_FIELDS)
        .append(SQL` FROM user_warnings WHERE warned_address = ${address} ORDER BY warned_at DESC`)

      const result = await database.query<UserWarning>(query)
      return result.rows
    },

    async getBanHistory(address: string): Promise<UserBan[]> {
      const query = SQL`SELECT `
        .append(BAN_SELECT_FIELDS)
        .append(SQL` FROM user_bans WHERE banned_address = ${address} ORDER BY banned_at DESC`)

      const result = await database.query<UserBan>(query)
      return result.rows
    }
  }
}
