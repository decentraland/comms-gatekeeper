import { MigrationBuilder, PgType, ColumnDefinitions } from 'node-pg-migrate'

export const SceneAdminColumns: ColumnDefinitions = {
  id: { type: PgType.UUID, primaryKey: true },
  entity_id: { type: PgType.VARCHAR, notNull: true },
  admin: { type: PgType.VARCHAR, notNull: true },
  owner: { type: PgType.VARCHAR, notNull: true },
  added_by: { type: PgType.VARCHAR, notNull: true },
  active: { type: PgType.BOOL, notNull: true, default: true },
  created_at: { type: PgType.BIGINT, notNull: true }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('scene_admin', SceneAdminColumns)

  pgm.createIndex('scene_admin', ['entity_id', 'admin'], {
    unique: true,
    where: 'active = true',
    name: 'unique_active_scene_admin_entity_id_admin'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('scene_admin')
}
