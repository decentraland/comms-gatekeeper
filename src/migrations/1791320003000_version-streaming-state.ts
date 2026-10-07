import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('scene_stream_access', {
    streaming_state_version: { type: 'bigint', notNull: true, default: 0 }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('scene_stream_access', 'streaming_state_version')
}
