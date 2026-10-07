import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()
  // Also makes a retry safe if an interrupted concurrent build left an invalid index.
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_stream_access_reconciliation')
  pgm.sql(`CREATE INDEX CONCURRENTLY idx_stream_access_reconciliation
    ON scene_stream_access (streaming_checked_at, id)
    WHERE active = true AND streaming = true AND ingress_id != ''`)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS idx_stream_access_reconciliation')
}
