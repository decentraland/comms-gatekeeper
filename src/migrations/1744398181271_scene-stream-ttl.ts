import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const SceneStreamTTLColumns: ColumnDefinitions = {
  streaming: { type: 'boolean', notNull: true, default: false },
  streaming_start_time: { type: 'bigint', notNull: false }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('scene_stream_access', SceneStreamTTLColumns)
  pgm.createIndex('scene_stream_access', ['ingress_id', 'active'], {
    name: 'unique_active_scene_stream_access_ingress_id',
    unique: true,
    where: 'active = true'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('scene_stream_access', 'unique_active_scene_stream_access_ingress_id')
  pgm.dropColumns('scene_stream_access', Object.keys(SceneStreamTTLColumns))
}
