/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex('voice_chat_users', 'room_name')
  pgm.createIndex('voice_chat_users', ['status', 'joined_at', 'status_updated_at'], {
    name: 'idx_voice_chat_users_status_joined_at_status_updated_at'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('voice_chat_users', 'room_name')
  pgm.dropIndex('voice_chat_users', 'idx_voice_chat_users_status_joined_at_status_updated_at')
}
