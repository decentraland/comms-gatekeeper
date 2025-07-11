import SQL from 'sql-template-strings'
import { PoolClient } from 'pg'
import { AppComponents } from '../../types'
import { IVoiceDBComponent, VoiceChatUser, VoiceChatUserStatus, CommunityVoiceChatUser } from './types'
import { RoomDoesNotExistError } from './errors'

export async function createVoiceDBComponent({
  database,
  logs,
  config
}: Pick<AppComponents, 'database' | 'logs' | 'config'>): Promise<IVoiceDBComponent> {
  const logger = logs.getLogger('voice-db')
  const VOICE_CHAT_CONNECTION_INTERRUPTED_TTL = await config.requireNumber('VOICE_CHAT_CONNECTION_INTERRUPTED_TTL')
  const VOICE_CHAT_INITIAL_CONNECTION_TTL = await config.requireNumber('VOICE_CHAT_INITIAL_CONNECTION_TTL')
  const VOICE_CHAT_EXPIRED_BATCH_SIZE = await config.requireNumber('VOICE_CHAT_EXPIRED_BATCH_SIZE')
  const COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL = 5 * 60 * 1000 // 5 minutes

  /**
   * Private function to update the status of a participant in a room.
   * @param userAddress - The address of the user to update the status for.
   * @param roomName - The name of the room to update the status for.
   * @param status - The new status of the participant.
   */
  async function _updateUserStatus(
    userAddress: string,
    roomName: string,
    status: VoiceChatUserStatus,
    txClient?: PoolClient
  ): Promise<void> {
    const now = Date.now()
    const query = SQL`UPDATE voice_chat_users SET status = ${status}, status_updated_at = ${now} WHERE address = ${userAddress} AND room_name = ${roomName}`
    await (txClient ? txClient.query(query) : database.query(query))
  }

  /**
   * Private function to execute a transaction.
   * @param cb - The callback to execute in the transaction.
   * @returns The result of the callback.
   */
  async function _executeTx<T>(cb: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = database.getPool()
    const client = await pool.connect()
    await client.query('BEGIN')

    try {
      const res = await cb(client)
      await client.query('COMMIT')
      return res
    } catch (error: any) {
      logger.error(`Error executing transaction: ${error.message}`)
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Removes a private voice chat from the database by removing all users from the room.
   * If the given address is not in the room, an error is thrown.
   * @param roomName - The name of the room to remove.
   * @param address - The address of the user to remove from the room.
   * @returns The addresses of the users that were in the deleted room.
   */
  async function deletePrivateVoiceChat(roomName: string, address: string): Promise<string[]> {
    return _executeTx(async (txClient) => {
      const result = await txClient.query(SQL`SELECT address FROM voice_chat_users WHERE room_name = ${roomName}`)

      if (result.rows.length === 0 || !result.rows.some((row) => row.address === address)) {
        throw new RoomDoesNotExistError(roomName)
      }

      const query = SQL`DELETE FROM voice_chat_users WHERE room_name = ${roomName}`
      await txClient.query(query)

      return result.rows.map((row) => row.address)
    })
  }

  /**
   * Checks if a private room is active. A private room is active if:
   * - There are two or more users in the room that were not timed out due to a connection interruption.
   * - There are two or more users in the room that were not timed out due to not having initially connected.
   * - There are more than one user in the room that didn't left the room voluntarily.
   * - There are two or more users in the room that are connected.
   * @param roomName - The name of the room to check.
   * @returns True if the room is active, false otherwise.
   */
  async function isPrivateRoomActive(roomName: string): Promise<boolean> {
    const now = Date.now()
    const usersInRoom = await getUsersInRoom(roomName)
    const hasInactiveUser = usersInRoom.some((user) => {
      const hasBeenInterruptedLongerThanTTL =
        user.status === VoiceChatUserStatus.ConnectionInterrupted &&
        user.statusUpdatedAt + VOICE_CHAT_CONNECTION_INTERRUPTED_TTL < now
      const hasNotJoinedLongerThanTTL =
        user.status === VoiceChatUserStatus.NotConnected && user.joinedAt + VOICE_CHAT_INITIAL_CONNECTION_TTL < now
      const hasLeftVoluntarily = user.status === VoiceChatUserStatus.Disconnected
      return hasBeenInterruptedLongerThanTTL || hasNotJoinedLongerThanTTL || hasLeftVoluntarily
    })
    return !hasInactiveUser && usersInRoom.length >= 2
  }

  /**
   * Private function to get the room the user is in. A user is connected to a room if:
   * - The user is connected to the room.
   * - The user has a connection interrupted less than VOICE_CHAT_CONNECTION_INTERRUPTED_TTL ago.
   * - The user has not connected to the room less than VOICE_CHAT_INITIAL_CONNECTION_TTL ago.
   * @param userAddress - The address of the user to get the room for.
   * @param txClient - The transaction client to use.
   * @returns The room the user is in, or null if the user is not in a room.
   */
  async function _getRoomUserIsIn(userAddress: string, txClient?: PoolClient): Promise<string | null> {
    const now = Date.now()
    const query = SQL`SELECT room_name FROM voice_chat_users WHERE address = ${userAddress} AND
    (status = ${VoiceChatUserStatus.Connected} OR
      (status = ${VoiceChatUserStatus.ConnectionInterrupted} AND status_updated_at > ${now - VOICE_CHAT_CONNECTION_INTERRUPTED_TTL})
      OR (status = ${VoiceChatUserStatus.NotConnected} AND joined_at > ${now - VOICE_CHAT_INITIAL_CONNECTION_TTL}))
    ORDER BY 
      CASE status 
        WHEN ${VoiceChatUserStatus.Connected} THEN 1 
        WHEN ${VoiceChatUserStatus.ConnectionInterrupted} THEN 2 
        WHEN ${VoiceChatUserStatus.NotConnected} THEN 3 
        ELSE 4 
      END,
      status_updated_at DESC 
    LIMIT 1`
    const result = await (txClient ? txClient.query(query) : database.query(query))
    return result.rows[0]?.room_name || null
  }

  /**
   * Gets the room the user is in. A user is connected to a room if:
   * - There's a user in the room with a connection interrupted more than VOICE_CHAT_CONNECTION_INTERRUPTED_TTL ago.
   * - There's a user in the room that left the room voluntarily.
   * @param userAddress - The address of the user to get the room for.
   * @returns The room the user is in, or null if the user is not in a room.
   */
  async function getRoomUserIsIn(userAddress: string): Promise<string | null> {
    return _getRoomUserIsIn(userAddress)
  }

  /**
   * Joins a user to a room. If the user is already in a room, disconnects them from the other room.
   * @param userAddress - The address of the user to join to the room.
   * @param roomName - The name of the room to join the user to.
   * @returns The room the user was in before joining the new room.
   */
  async function joinUserToRoom(userAddress: string, roomName: string): Promise<{ oldRoom: string }> {
    return _executeTx(async (txClient) => {
      const roomUserIsIn = await _getRoomUserIsIn(userAddress, txClient)

      // Joining users must always be in a room, as they're being added to the DB upon creating the voice chat room.
      if (roomUserIsIn === null) {
        throw new Error(`User ${userAddress} is not in a room`)
      }

      // If the user is in another room, disconnect them from the other room.
      if (roomUserIsIn !== roomName) {
        await _updateUserStatus(userAddress, roomUserIsIn, VoiceChatUserStatus.Disconnected, txClient)
      }

      // Set the user to connected.
      await _updateUserStatus(userAddress, roomName, VoiceChatUserStatus.Connected, txClient)

      return { oldRoom: roomUserIsIn }
    })
  }

  /**
   * Updates the status of a user in a room to disconnected. This is used when the user left the room voluntarily.
   * @param userAddress - The address of the user to remove from the room.
   * @param roomName - The name of the room to remove the user from.
   */
  async function updateUserStatusAsDisconnected(userAddress: string, roomName: string): Promise<void> {
    return _updateUserStatus(userAddress, roomName, VoiceChatUserStatus.Disconnected)
  }

  /**
   * Updates the status of a user in a room to connection interrupted. This is used when the user's connection was interrupted.
   * @param userAddress - The address of the user to disconnect from the room.
   * @param roomName - The name of the room to disconnect the user from.
   */
  async function updateUserStatusAsConnectionInterrupted(userAddress: string, roomName: string): Promise<void> {
    return _updateUserStatus(userAddress, roomName, VoiceChatUserStatus.ConnectionInterrupted)
  }

  /**
   * Creates a voice chat room and set the users into the room. The users are set to not connected.
   * @param roomName - The name of the room to create.
   * @param userAddresses - The addresses of the users to create the room for.
   */
  async function createVoiceChatRoom(roomName: string, userAddresses: string[]): Promise<void> {
    const now = Date.now()
    const query = SQL`INSERT INTO voice_chat_users (address, room_name, status, joined_at, status_updated_at) VALUES `
    userAddresses.forEach((userAddress, index) => {
      query.append(SQL`(${userAddress}, ${roomName}, ${VoiceChatUserStatus.NotConnected}, ${now}, ${now})`)
      if (index < userAddresses.length - 1) {
        query.append(SQL`, `)
      }
    })

    await database.query(query)
  }

  /**
   * Gets the users in a room.
   * @param roomName - The name of the room to get the users for.
   * @returns The users in the room.
   */
  async function getUsersInRoom(roomName: string): Promise<VoiceChatUser[]> {
    const query = SQL`SELECT * FROM voice_chat_users WHERE room_name = ${roomName}`
    const result = await database.query(query)
    return result.rows.map((row) => ({
      address: row.address,
      roomName: row.room_name,
      status: row.status,
      joinedAt: Number(row.joined_at),
      statusUpdatedAt: Number(row.status_updated_at)
    }))
  }

  /**
   * Deletes expired private voice chats and returns the names of the rooms that were deleted.
   * A private voice chat is expired if:
   * - There's a user in the room that left the room voluntarily.
   * - There's a user in the room with a connection interrupted more than VOICE_CHAT_CONNECTION_INTERRUPTED_TTL ago.
   * - There's a user in the room that was not connected to the room for more than VOICE_CHAT_INITIAL_CONNECTION_TTL ago.
   * Room where the users left voluntarily should not be returned, as they have already been deleted in LiveKit.
   * @returns The names of the rooms that were deleted when the users were in the rooms.
   */
  async function deleteExpiredPrivateVoiceChats(): Promise<string[]> {
    const now = Date.now()
    return _executeTx(async (txClient) => {
      const expiredQuery = SQL`
        WITH expired_rooms AS (
          SELECT 
            room_name,
            MAX(
              CASE
                WHEN status = ${VoiceChatUserStatus.NotConnected} OR status = ${VoiceChatUserStatus.ConnectionInterrupted}
                THEN 1
                ELSE 0
              END
            )::boolean AS should_destroy_room 
          FROM voice_chat_users WHERE 
            (status = ${VoiceChatUserStatus.NotConnected} AND joined_at <= ${now - VOICE_CHAT_INITIAL_CONNECTION_TTL})
            OR (status = ${VoiceChatUserStatus.ConnectionInterrupted} AND status_updated_at <= ${now - VOICE_CHAT_CONNECTION_INTERRUPTED_TTL})
            OR (status = ${VoiceChatUserStatus.Disconnected})
          GROUP BY room_name LIMIT ${VOICE_CHAT_EXPIRED_BATCH_SIZE}
        )
        DELETE FROM voice_chat_users USING expired_rooms WHERE voice_chat_users.room_name = expired_rooms.room_name
        RETURNING expired_rooms.room_name, expired_rooms.should_destroy_room`
      const expiredResult = await txClient.query(expiredQuery)
      return [...new Set(expiredResult.rows.filter((row) => row.should_destroy_room).map((row) => row.room_name))]
    })
  }

  /**
   * Creates a community voice chat room. Unlike private rooms, community rooms don't pre-populate users.
   * @param roomName - The name of the community room to create.
   * @param moderatorAddress - The address of the initial moderator.
   */
  async function createCommunityVoiceChatRoom(roomName: string, moderatorAddress: string): Promise<void> {
    const now = Date.now()
    const query = SQL`INSERT INTO community_voice_chat_users (address, room_name, is_moderator, status, joined_at, status_updated_at) 
                      VALUES (${moderatorAddress}, ${roomName}, true, ${VoiceChatUserStatus.NotConnected}, ${now}, ${now})`
    await database.query(query)
  }

  /**
   * Joins a user to a community voice chat room.
   * @param userAddress - The address of the user to join.
   * @param roomName - The name of the community room.
   * @param isModerator - Whether the user is a moderator.
   */
  async function joinUserToCommunityRoom(
    userAddress: string,
    roomName: string,
    isModerator: boolean = false
  ): Promise<void> {
    const now = Date.now()

    return _executeTx(async (txClient) => {
      // Check if user is already in the room
      const existingQuery = SQL`SELECT * FROM community_voice_chat_users WHERE address = ${userAddress} AND room_name = ${roomName}`
      const existingResult = await txClient.query(existingQuery)

      if (existingResult.rows.length > 0) {
        // Update existing user - keep them as NotConnected until webhook confirms connection
        const updateQuery = SQL`UPDATE community_voice_chat_users 
                               SET status = ${VoiceChatUserStatus.NotConnected}, 
                                   status_updated_at = ${now},
                                   is_moderator = ${isModerator}
                               WHERE address = ${userAddress} AND room_name = ${roomName}`
        await txClient.query(updateQuery)
      } else {
        // Insert new user - start as NotConnected until webhook confirms connection
        const insertQuery = SQL`INSERT INTO community_voice_chat_users (address, room_name, is_moderator, status, joined_at, status_updated_at) 
                               VALUES (${userAddress}, ${roomName}, ${isModerator}, ${VoiceChatUserStatus.NotConnected}, ${now}, ${now})`
        await txClient.query(insertQuery)
      }
    })
  }

  /**
   * Updates the status of a user in a community room.
   */
  async function updateCommunityUserStatus(
    userAddress: string,
    roomName: string,
    status: VoiceChatUserStatus
  ): Promise<void> {
    const now = Date.now()
    const query = SQL`UPDATE community_voice_chat_users 
                      SET status = ${status}, status_updated_at = ${now} 
                      WHERE address = ${userAddress} AND room_name = ${roomName}`
    await database.query(query)
  }

  /**
   * Gets users in a community voice chat room.
   */
  async function getCommunityUsersInRoom(roomName: string): Promise<CommunityVoiceChatUser[]> {
    const query = SQL`SELECT * FROM community_voice_chat_users WHERE room_name = ${roomName}`
    const result = await database.query(query)
    return result.rows.map((row) => ({
      address: row.address,
      roomName: row.room_name,
      isModerator: row.is_moderator,
      status: row.status,
      joinedAt: Number(row.joined_at),
      statusUpdatedAt: Number(row.status_updated_at)
    }))
  }

  /**
   * Checks if a community room should be destroyed.
   * A community room should be destroyed if there are no moderators connected for more than 5 minutes.
   */
  async function shouldDestroyCommunityRoom(roomName: string): Promise<boolean> {
    const now = Date.now()
    const users = await getCommunityUsersInRoom(roomName)

    const activeModerators = users.filter(
      (user) =>
        user.isModerator &&
        (user.status === VoiceChatUserStatus.Connected ||
          (user.status === VoiceChatUserStatus.ConnectionInterrupted &&
            user.statusUpdatedAt + VOICE_CHAT_CONNECTION_INTERRUPTED_TTL > now) ||
          (user.status === VoiceChatUserStatus.NotConnected && user.joinedAt + VOICE_CHAT_INITIAL_CONNECTION_TTL > now))
    )

    if (activeModerators.length === 0) {
      // Check when the last moderator left
      const lastModeratorLeft = users
        .filter((user) => user.isModerator)
        .reduce((latest, user) => Math.max(latest, user.statusUpdatedAt), 0)

      return now - lastModeratorLeft > COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL
    }

    return false
  }

  /**
   * Deletes a community voice chat room.
   */
  async function deleteCommunityVoiceChat(roomName: string): Promise<string[]> {
    return _executeTx(async (txClient) => {
      const result = await txClient.query(
        SQL`SELECT address FROM community_voice_chat_users WHERE room_name = ${roomName}`
      )
      const query = SQL`DELETE FROM community_voice_chat_users WHERE room_name = ${roomName}`
      await txClient.query(query)
      return result.rows.map((row) => row.address)
    })
  }

  /**
   * Deletes expired community voice chats and returns the names of the rooms that were deleted.
   */
  async function deleteExpiredCommunityVoiceChats(): Promise<string[]> {
    const now = Date.now()
    return _executeTx(async (txClient) => {
      // Get rooms where:
      // 1. No moderators have been active for more than 5 minutes, OR
      // 2. Room has no moderators at all
      const expiredQuery = SQL`
        WITH room_moderator_status AS (
          SELECT 
            room_name,
            COUNT(CASE WHEN is_moderator = true THEN 1 END) as moderator_count,
            MAX(CASE WHEN is_moderator = true THEN status_updated_at ELSE 0 END) as last_moderator_activity
          FROM community_voice_chat_users 
          GROUP BY room_name
        ),
        expired_rooms AS (
          SELECT room_name 
          FROM room_moderator_status 
          WHERE (
            -- Case 1: Room has no moderators at all
            moderator_count = 0
          ) OR (
            -- Case 2: Room has moderators but none active for more than 5 minutes
            moderator_count > 0 
            AND last_moderator_activity > 0 
            AND last_moderator_activity <= ${now - COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL}
          )
          LIMIT ${VOICE_CHAT_EXPIRED_BATCH_SIZE}
        )
        DELETE FROM community_voice_chat_users USING expired_rooms 
        WHERE community_voice_chat_users.room_name = expired_rooms.room_name
        RETURNING expired_rooms.room_name`

      const expiredResult = await txClient.query(expiredQuery)
      return [...new Set(expiredResult.rows.map((row) => row.room_name))]
    })
  }

  return {
    deleteExpiredPrivateVoiceChats,
    getUsersInRoom,
    isPrivateRoomActive,
    deletePrivateVoiceChat,
    createVoiceChatRoom,
    joinUserToRoom,
    updateUserStatusAsDisconnected,
    updateUserStatusAsConnectionInterrupted,
    getRoomUserIsIn,
    // Community voice chat methods
    createCommunityVoiceChatRoom,
    joinUserToCommunityRoom,
    updateCommunityUserStatus,
    getCommunityUsersInRoom,
    shouldDestroyCommunityRoom,
    deleteCommunityVoiceChat,
    deleteExpiredCommunityVoiceChats
  }
}
