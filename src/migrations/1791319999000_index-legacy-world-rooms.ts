import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`CREATE INDEX idx_stream_access_legacy_room ON scene_stream_access (lower(room_id), created_at DESC)
    WHERE active = true`)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX idx_stream_access_legacy_room')
}
