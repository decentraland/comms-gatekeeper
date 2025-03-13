import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const SceneStreamAccessColumns: ColumnDefinitions = {
  id: { type: 'uuid', primaryKey: true },
  place_id: { type: 'text', notNull: true },
  streaming_url: { type: 'text', notNull: true },
  streaming_key: { type: 'text', notNull: true },
  ingress_id: { type: 'text', notNull: true },
  created_at: { type: 'bigint', notNull: true },
  active: { type: 'boolean', notNull: true, default: true }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('scene_stream_access', SceneStreamAccessColumns)
  pgm.createIndex('scene_stream_access', ['place_id', 'active'], {
    name: 'unique_active_scene_stream_access_place_id',
    unique: true,
    where: 'active = true'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('scene_stream_access', 'unique_active_scene_stream_access_place_id')
  pgm.dropTable('scene_stream_access')
}
