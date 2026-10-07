import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('scene_stream_access', { ingress_cleanup_pending: { type: 'boolean', notNull: true, default: false } })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('scene_stream_access', 'ingress_cleanup_pending')
}
