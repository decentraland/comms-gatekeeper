import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add expiration_time column to scene_stream_access table
  pgm.addColumn('scene_stream_access', {
    expiration_time: { type: 'bigint', notNull: false }
  })

  // Add index for expiration time to optimize cleanup queries
  pgm.createIndex('scene_stream_access', 'expiration_time', {
    name: 'idx_scene_stream_access_expiration_time'
  })

  // Add index for streaming_key for faster lookups
  pgm.createIndex('scene_stream_access', 'streaming_key', {
    name: 'idx_scene_stream_access_streaming_key'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('scene_stream_access', 'idx_scene_stream_access_streaming_key')
  pgm.dropIndex('scene_stream_access', 'idx_scene_stream_access_expiration_time')
  pgm.dropColumn('scene_stream_access', 'expiration_time')
}
