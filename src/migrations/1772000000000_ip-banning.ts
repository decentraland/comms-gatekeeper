/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Records which IP each wallet connected from. Used for IP↔wallet lookups
  // and transitive banning. TTL cleanup (rows older than 90 days) is a follow-up item.
  pgm.createTable('connection_logs', {
    id: {
      type: PgType.UUID,
      primaryKey: true,
      notNull: true,
      default: pgm.func('gen_random_uuid()')
    },
    address: {
      type: PgType.VARCHAR,
      notNull: true
    },
    ip: {
      type: PgType.VARCHAR,
      notNull: true
    },
    connected_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })

  pgm.createIndex('connection_logs', 'address', {
    name: 'idx_connection_logs_address'
  })

  pgm.createIndex('connection_logs', 'ip', {
    name: 'idx_connection_logs_ip'
  })

  pgm.createTable('ip_bans', {
    id: {
      type: PgType.UUID,
      primaryKey: true,
      notNull: true,
      default: pgm.func('gen_random_uuid()')
    },
    banned_ip: {
      type: PgType.VARCHAR,
      notNull: true
    },
    banned_by: {
      type: PgType.VARCHAR,
      notNull: true
    },
    reason: {
      type: PgType.TEXT,
      notNull: true
    },
    custom_message: {
      type: PgType.TEXT,
      notNull: false
    },
    banned_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    },
    expires_at: {
      type: PgType.TIMESTAMP,
      notNull: false
    },
    lifted_at: {
      type: PgType.TIMESTAMP,
      notNull: false
    },
    lifted_by: {
      type: PgType.VARCHAR,
      notNull: false
    },
    created_at: {
      type: PgType.TIMESTAMP,
      notNull: true,
      default: pgm.func('now()')
    }
  })

  pgm.createIndex('ip_bans', 'banned_ip', {
    name: 'idx_ip_bans_banned_ip'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('ip_bans')
  pgm.dropTable('connection_logs')
}
