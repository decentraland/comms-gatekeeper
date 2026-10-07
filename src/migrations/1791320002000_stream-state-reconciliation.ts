import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('scene_stream_access', { streaming_checked_at: { type: 'bigint', notNull: true, default: 0 } })
  pgm.sql(`CREATE INDEX idx_stream_access_reconciliation ON scene_stream_access (streaming_checked_at, id)
    WHERE active = true AND streaming = true AND ingress_id != ''`)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX idx_stream_access_reconciliation')
  pgm.dropColumn('scene_stream_access', 'streaming_checked_at')
}
