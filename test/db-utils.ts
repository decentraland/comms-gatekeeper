import { IDatabase } from '@well-known-components/interfaces'

export async function setUserJoinedAt(
  db: IDatabase,
  address: string,
  roomName: string,
  joinedAt: number
): Promise<void> {
  await db.query(
    `UPDATE voice_chat_users SET joined_at = ${joinedAt} WHERE address = '${address}' AND room_name = '${roomName}'`
  )
}

export async function setUserStatusUpdatedAt(
  db: IDatabase,
  address: string,
  roomName: string,
  statusUpdatedAt: number
): Promise<void> {
  await db.query(
    `UPDATE voice_chat_users SET status_updated_at = ${statusUpdatedAt} WHERE address = '${address}' AND room_name = '${roomName}'`
  )
}

/**
 * Helper to set community user status with timestamp in the past
 */
export async function setCommunityUserStatus(
  db: IDatabase,
  address: string,
  roomName: string,
  status: string,
  statusUpdatedAtMillis: number
): Promise<void> {
  await db.query(
    `UPDATE community_voice_chat_users SET status = '${status}', status_updated_at = ${statusUpdatedAtMillis} WHERE address = '${address}' AND room_name = '${roomName}'`
  )
}

/**
 * Helper to set community user joined_at timestamp
 */
export async function setCommunityUserJoinedAt(
  db: IDatabase,
  address: string,
  roomName: string,
  joinedAt: number
): Promise<void> {
  await db.query(
    `UPDATE community_voice_chat_users SET joined_at = ${joinedAt} WHERE address = '${address}' AND room_name = '${roomName}'`
  )
}
