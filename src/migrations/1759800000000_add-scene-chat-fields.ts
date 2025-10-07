import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add room_id column to scene_stream_access table
  // Stores the LiveKit room ID (e.g., scene:realm:sceneId) for direct lookups
  // This simplifies queries and eliminates the need for separate scene_id and realm_name columns
  pgm.addColumn('scene_stream_access', {
    room_id: { type: 'text', notNull: false }
  })

  // Add index for room_id for faster lookups
  pgm.createIndex('scene_stream_access', 'room_id', {
    name: 'idx_scene_stream_access_room_id'
  })

  // Add generated_by column to track who created the stream link
  pgm.addColumn('scene_stream_access', {
    generated_by: { type: 'text', notNull: false }
  })

  // Add index for generated_by for tracking purposes
  pgm.createIndex('scene_stream_access', 'generated_by', {
    name: 'idx_scene_stream_access_generated_by'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('scene_stream_access', 'idx_scene_stream_access_generated_by')
  pgm.dropIndex('scene_stream_access', 'idx_scene_stream_access_room_id')
  pgm.dropColumn('scene_stream_access', 'generated_by')
  pgm.dropColumn('scene_stream_access', 'room_id')
}
