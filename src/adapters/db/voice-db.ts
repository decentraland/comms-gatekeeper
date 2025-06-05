import SQL from 'sql-template-strings'
import { PoolClient } from 'pg'
import { AppComponents } from '../../types'
import { IVoiceDBComponent, VoiceChatUserStatus } from './types'

export async function createVoiceDBComponent({
  database,
  logs,
  config
}: Pick<AppComponents, 'database' | 'logs' | 'config'>): Promise<IVoiceDBComponent> {
  const logger = logs.getLogger('voice-db')
  const VOICE_CHAT_CONNECTION_INTERRUPTED_TTL = await config.requireNumber('VOICE_CHAT_CONNECTION_INTERRUPTED_TTL')
  const VOICE_CHAT_INITIAL_CONNECTION_TTL = await config.requireNumber('VOICE_CHAT_INITIAL_CONNECTION_TTL')

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
    const query = SQL`UPDATE voice_chat_users SET status = ${status}, status_updated_at = ${new Date()} WHERE address = ${userAddress} AND roomName = ${roomName}`
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
   */
  async function deletePrivateVoiceChat(roomName: string, address: string): Promise<void> {
    await _executeTx(async (txClient) => {
      const result = await txClient.query(
        SQL`SELECT EXISTS(SELECT 1 FROM voice_chat_users WHERE address = ${address} AND roomName = ${roomName}) AS exists`
      )
      if (!result.rows[0]?.exists) {
        throw new Error(`User ${address} is not in room ${roomName}`)
      }

      const query = SQL`DELETE FROM voice_chat_users WHERE roomName = ${roomName}`
      await txClient.query(query)
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
    const query = SQL`SELECT roomName FROM voice_chat_users WHERE voice_chat_users.roomName = ${roomName} AND
    ((voice_chat_users.status = ${VoiceChatUserStatus.ConnectionInterrupted} AND voice_chat_users.status_updated_at + ${VOICE_CHAT_CONNECTION_INTERRUPTED_TTL} > ${now})
      OR (voice_chat_users.status = ${VoiceChatUserStatus.NotConnected} AND voice_chat_users.joined_at + ${VOICE_CHAT_INITIAL_CONNECTION_TTL} > ${now})
      OR (voice_chat_users.status = ${VoiceChatUserStatus.Connected}))`
    const result = await database.query(query)
    return result.rows.length >= 2
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
    const query = SQL`SELECT roomName FROM voice_chat_users WHERE address = ${userAddress} AND
    (status = ${VoiceChatUserStatus.Connected} OR
      (status = ${VoiceChatUserStatus.ConnectionInterrupted} AND status_updated_at + ${VOICE_CHAT_CONNECTION_INTERRUPTED_TTL} > ${now})
      OR (status = ${VoiceChatUserStatus.NotConnected} AND joined_at + ${VOICE_CHAT_INITIAL_CONNECTION_TTL} > ${now}))
    ORDER BY status_updated_at DESC LIMIT 1`
    const result = await (txClient ? txClient.query(query) : database.query(query))
    return result.rows[0]?.roomName || null
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
   * @returns The room the user was in before joining the new room, or null if the user was not in a room.
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
   * Removes a user from a room. This is used when the user left the room voluntarily.
   * @param userAddress - The address of the user to remove from the room.
   * @param roomName - The name of the room to remove the user from.
   */
  async function removeUserFromRoom(userAddress: string, roomName: string): Promise<void> {
    return _updateUserStatus(userAddress, roomName, VoiceChatUserStatus.Disconnected)
  }

  /**
   * Disconnects a user from a room. This is used when the user's connection was interrupted.
   * @param userAddress - The address of the user to disconnect from the room.
   * @param roomName - The name of the room to disconnect the user from.
   */
  async function disconnectUserFromRoom(userAddress: string, roomName: string): Promise<void> {
    return _updateUserStatus(userAddress, roomName, VoiceChatUserStatus.ConnectionInterrupted)
  }

  /**
   * Creates a voice chat room and set the users into the room. The users are set to not connected.
   * @param roomId - The ID suffix of the room to create.
   * @param userAddresses - The addresses of the users to create the room for.
   */
  async function createVoiceChatRoom(roomId: string, userAddresses: string[]): Promise<void> {
    const now = Date.now()
    const query = SQL`INSERT INTO voice_chat_users (address, roomName, status, joined_at, status_updated_at) VALUES `
    userAddresses.forEach((userAddress, index) => {
      query.append(SQL`(${userAddress}, ${roomId}, ${VoiceChatUserStatus.NotConnected}, ${now}, ${now})`)
      if (index < userAddresses.length - 1) {
        query.append(SQL`, `)
      }
    })

    await database.query(query)
  }

  return {
    isPrivateRoomActive,
    deletePrivateVoiceChat,
    createVoiceChatRoom,
    joinUserToRoom,
    removeUserFromRoom,
    disconnectUserFromRoom,
    getRoomUserIsIn
  }
}
