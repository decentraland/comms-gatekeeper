/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions, PgType } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Snapshot, at ban time, of the player's device id (read from player_connection_info).
  // Lets us reject a banned player who reconnects from the same device under a different
  // wallet. Nullable: a player with no recorded connection info is still banned by address.
  pgm.addColumn('user_bans', {
    banned_device_id: {
      type: PgType.TEXT,
      notNull: false
    }
  })

  // Partial index so the per-token-request ban lookup stays fast and only scans
  // currently-active bans.
  pgm.createIndex('user_bans', 'banned_device_id', {
    name: 'idx_user_bans_banned_device_id_active',
    where: 'lifted_at IS NULL AND banned_device_id IS NOT NULL'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('user_bans', 'banned_device_id', { name: 'idx_user_bans_banned_device_id_active' })
  pgm.dropColumn('user_bans', 'banned_device_id')
}
