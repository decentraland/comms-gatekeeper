import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Drop the unique index on ingress_id for active streams
  // This constraint is no longer needed for Cast 2.0 which uses WebRTC instead of RTMP ingress
  // Multiple Cast 2.0 streams can have empty ingress_id values
  pgm.dropIndex('scene_stream_access', 'unique_active_scene_stream_access_ingress_id', {
    ifExists: true
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Recreate the unique index if rolling back
  pgm.createIndex('scene_stream_access', ['ingress_id', 'active'], {
    name: 'unique_active_scene_stream_access_ingress_id',
    unique: true,
    where: 'active = true'
  })
}
