/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('voice_chat_users', {
    address: { type: 'varchar(42)', notNull: true },
    roomName: { type: 'varchar', notNull: true },
    // 'connected' | 'connection_interrupted' | 'disconnected'
    status: { type: 'varchar', notNull: true },
    // Milliseconds since epoch
    joined_at: { type: 'bigint', notNull: true },
    // Milliseconds since epoch
    status_updated_at: { type: 'bigint', notNull: true }
  })

  pgm.addConstraint('voice_chat_users', 'pk_voice_chat_users', {
    primaryKey: ['address', 'roomName']
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('voice_chat_users')
}
