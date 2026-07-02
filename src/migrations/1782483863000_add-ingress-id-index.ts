import { MigrationBuilder } from 'node-pg-migrate'

// Migration 1760707094072 dropped the unique index `unique_active_scene_stream_access_ingress_id`
// (because Cast 2.0 rows may share an empty ingress_id) but left no index covering ingress_id.
// startStreaming/stopStreaming/isStreaming/killStreaming and getActiveIngressIds all filter on
// `ingress_id = $1 AND active = true` against a table that only ever grows (rows are soft-deactivated,
// never deleted), so every LiveKit ingress webhook and cron cleanup was doing a sequential scan.
// Recreate a NON-unique partial index to restore index-backed lookups without reimposing uniqueness.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex('scene_stream_access', ['ingress_id'], {
    name: 'idx_active_scene_stream_access_ingress_id',
    where: 'active = true',
    ifNotExists: true
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('scene_stream_access', ['ingress_id'], {
    name: 'idx_active_scene_stream_access_ingress_id',
    ifExists: true
  })
}
