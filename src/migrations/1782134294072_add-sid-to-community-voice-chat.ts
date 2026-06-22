import { MigrationBuilder } from 'node-pg-migrate'

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Track the LiveKit participant session id (sid) for each community voice chat user.
  // This lets us tell apart a stale "participant_left" webhook coming from a previous
  // session and the user's current session after an immediate leave + rejoin, so we
  // don't disconnect them (or tear down the room) while they are reconnecting.
  pgm.addColumn('community_voice_chat_users', {
    sid: {
      type: 'TEXT',
      notNull: false
    }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('community_voice_chat_users', 'sid')
}
