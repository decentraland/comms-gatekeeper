/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('scene_bans', {
    id: { type: 'uuid', primaryKey: true },
    place_id: { type: 'text', notNull: true },
    banned_address: { type: 'text', notNull: true },
    banned_by: { type: 'text', notNull: true },
    unbanned_by: { type: 'text', notNull: false },
    banned_at: { type: 'bigint', notNull: true },
    unbanned_at: { type: 'bigint', notNull: false },
    active: { type: 'boolean', notNull: true, default: true }
  })

  pgm.createIndex('scene_bans', ['place_id', 'banned_address'], {
    name: 'unique_active_scene_bans_place_id_banned_address',
    unique: true,
    where: 'active = true'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('scene_bans', 'unique_active_scene_bans_place_id_banned_address')
  pgm.dropTable('scene_bans')
}
