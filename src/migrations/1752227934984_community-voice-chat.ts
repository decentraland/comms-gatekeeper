import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('community_voice_chat_users', {
    address: {
      type: 'TEXT',
      notNull: true
    },
    room_name: {
      type: 'TEXT',
      notNull: true
    },
    is_moderator: {
      type: 'BOOLEAN',
      notNull: true,
      default: false
    },
    status: {
      type: 'TEXT',
      notNull: true,
      check: "status IN ('connected', 'connection_interrupted', 'disconnected', 'not_connected')"
    },
    joined_at: {
      type: 'BIGINT',
      notNull: true
    },
    status_updated_at: {
      type: 'BIGINT',
      notNull: true
    },
    // Adding created_at for debugging purposes
    created_at: {
      type: 'TIMESTAMPTZ',
      notNull: true,
      default: pgm.func('now()')
    }
  })

  // Primary key on address + room_name (one user per room)
  pgm.addConstraint('community_voice_chat_users', 'community_voice_chat_users_pkey', {
    primaryKey: ['address', 'room_name']
  })

  // Index for efficient room queries
  pgm.createIndex('community_voice_chat_users', 'room_name')

  // Index for efficient moderator queries
  pgm.createIndex('community_voice_chat_users', ['room_name', 'is_moderator'])

  // Index for status-based queries (cleanup jobs)
  pgm.createIndex('community_voice_chat_users', ['status', 'status_updated_at'])
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('community_voice_chat_users')
}
