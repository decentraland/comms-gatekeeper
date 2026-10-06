import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('scene_stream_access', {
    ingress_cleanup_retry_at: { type: 'bigint', notNull: true, default: 0 },
    ingress_cleanup_claim_until: { type: 'bigint', notNull: true, default: 0 },
    ingress_cleanup_claim_token: { type: 'uuid' },
    ingress_cleanup_expired: { type: 'boolean', notNull: true, default: false }
  })
  pgm.sql(`CREATE INDEX idx_stream_cleanup_pending ON scene_stream_access (ingress_cleanup_retry_at, id)
    WHERE ingress_cleanup_pending = true`)
  pgm.sql(`CREATE INDEX idx_stream_cleanup_expiration ON scene_stream_access
    ((COALESCE(expiration_time, created_at + 345600000)), id)
    WHERE active = true AND streaming = false AND ingress_cleanup_pending = false`)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX idx_stream_cleanup_expiration')
  pgm.sql('DROP INDEX idx_stream_cleanup_pending')
  pgm.dropColumns('scene_stream_access', [
    'ingress_cleanup_retry_at',
    'ingress_cleanup_claim_until',
    'ingress_cleanup_claim_token',
    'ingress_cleanup_expired'
  ])
}
