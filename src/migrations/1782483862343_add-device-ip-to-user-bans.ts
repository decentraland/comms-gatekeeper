/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Snapshot, at ban time, of the player's device id and IP address (read from
  // player_connection_info). The device id is always captured; the IP is only set when
  // the moderator opts in. They let us reject a banned player who reconnects from the
  // same device/IP under a different wallet. Both nullable: a player with no recorded
  // connection info is still banned by address only.
  pgm.addColumn('user_bans', {
    banned_device_id: {
      type: PgType.TEXT,
      notNull: false
    },
    banned_ip: {
      type: 'varchar(45)',
      notNull: false
    }
  })

  // Partial indexes so the per-token-request ban lookup stays fast and only scans
  // currently-active bans.
  pgm.createIndex('user_bans', 'banned_device_id', {
    name: 'idx_user_bans_banned_device_id_active',
    where: 'lifted_at IS NULL AND banned_device_id IS NOT NULL'
  })
  pgm.createIndex('user_bans', 'banned_ip', {
    name: 'idx_user_bans_banned_ip_active',
    where: 'lifted_at IS NULL AND banned_ip IS NOT NULL'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('user_bans', 'banned_ip', { name: 'idx_user_bans_banned_ip_active' })
  pgm.dropIndex('user_bans', 'banned_device_id', { name: 'idx_user_bans_banned_device_id_active' })
  pgm.dropColumn('user_bans', ['banned_device_id', 'banned_ip'])
}
