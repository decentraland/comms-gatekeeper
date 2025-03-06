import { MigrationBuilder, PgType, ColumnDefinitions } from 'node-pg-migrate'

export const StreamingAccessColumns: ColumnDefinitions = {
  id: { type: PgType.UUID, primaryKey: true },
  entity_id: { type: PgType.VARCHAR, notNull: true },
  stream_key: { type: PgType.VARCHAR, notNull: true },
  ttl: { type: PgType.TIMESTAMP, notNull: true },
  admin: { type: PgType.VARCHAR, notNull: true },
  active: { type: PgType.BOOL, notNull: true, default: true },
  created_at: { type: PgType.BIGINT, notNull: true },
  updated_at: { type: PgType.BIGINT, notNull: true }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('streaming_access', StreamingAccessColumns)

  pgm.createIndex('streaming_access', ['entity_id', 'stream_key'], {
    unique: true,
    where: 'active = true',
    name: 'unique_active_streaming_access_entity_id_stream_key'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('streaming_access')
}
