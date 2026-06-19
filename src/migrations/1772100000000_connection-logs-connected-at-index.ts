/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Index on connected_at to support efficient TTL purge of expired connection logs (GDPR retention policy)
  pgm.createIndex('connection_logs', 'connected_at', {
    name: 'idx_connection_logs_connected_at'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('connection_logs', 'connected_at', {
    name: 'idx_connection_logs_connected_at'
  })
}
