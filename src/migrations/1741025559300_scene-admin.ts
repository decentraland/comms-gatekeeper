import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const SceneAdminColumns: ColumnDefinitions = {
  id: { type: 'uuid', primaryKey: true },
  place_id: { type: 'text', notNull: true },
  admin: { type: 'text', notNull: true },
  added_by: { type: 'text', notNull: true },
  created_at: { type: 'bigint', notNull: true },
  active: { type: 'boolean', notNull: true, default: true }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('scene_admin', SceneAdminColumns)
  pgm.createIndex('scene_admin', ['place_id', 'admin'], {
    name: 'unique_active_scene_admin_place_id_admin',
    unique: true,
    where: 'active = true'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('scene_admin', 'unique_active_scene_admin_place_id_admin')
  pgm.dropTable('scene_admin')
}
