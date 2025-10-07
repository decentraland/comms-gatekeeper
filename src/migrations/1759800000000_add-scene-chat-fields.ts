import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add scene_id and realm_name columns to scene_stream_access table
  // These fields store the scene and realm where the stream was initiated
  // Used to provide read-only chat access to Cast2 viewers
  pgm.addColumn('scene_stream_access', {
    scene_id: { type: 'text', notNull: false },
    realm_name: { type: 'text', notNull: false }
  })

  // Add index for scene_id and realm_name for faster lookups
  pgm.createIndex('scene_stream_access', ['scene_id', 'realm_name'], {
    name: 'idx_scene_stream_access_scene_realm'
  })

  // Add generated_by column to track who created the stream link
  pgm.addColumn('scene_stream_access', {
    generated_by: { type: 'text', notNull: false }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('scene_stream_access', 'idx_scene_stream_access_scene_realm')
  pgm.dropColumn('scene_stream_access', 'generated_by')
  pgm.dropColumn('scene_stream_access', 'realm_name')
  pgm.dropColumn('scene_stream_access', 'scene_id')
}
