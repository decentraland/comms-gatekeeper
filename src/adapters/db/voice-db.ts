import SQL from 'sql-template-strings'
import { PoolClient } from 'pg'
import { AppComponents } from '../../types'
import { IVoiceDBComponent, VoiceChatStatus } from './types'

export async function createVoiceDBComponent({
  database,
  logs,
  config
}: Pick<AppComponents, 'database' | 'logs' | 'config'>): Promise<IVoiceDBComponent> {
  const logger = logs.getLogger('voice-db')
  const VOICE_CHAT_CONNECTION_INTERRUPTED_TTL = await config.requireNumber('VOICE_CHAT_CONNECTION_INTERRUPTED_TTL')

  /**
   * Private function to update the status of a participant in a room.
   * @param userAddress - The address of the user to update the status for.
   * @param roomName - The name of the room to update the status for.
   * @param status - The new status of the participant.
   */
  async function _updateUserStatus(
    userAddress: string,
    roomName: string,
    status: VoiceChatStatus,
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
   * Checks if a room has expired. A room is expired if:
   * - There's a user in the room with a connection interrupted more than VOICE_CHAT_CONNECTION_INTERRUPTED_TTL ago.
   * - There's a user in the room that left the room voluntarily.
   * @param roomName - The name of the room to check.
   * @returns True if the room has expired, false otherwise.
   */
  async function hasRoomExpired(roomName: string): Promise<boolean> {
    const query = SQL`SELECT roomName FROM voice_chat_users WHERE 
    roomName = ${roomName} AND 
      ((status = ${VoiceChatStatus.ConnectionInterrupted} AND status_updated_at < ${new Date(Date.now() - VOICE_CHAT_CONNECTION_INTERRUPTED_TTL)})
       OR (status = ${VoiceChatStatus.Disconnected}))
    ORDER BY created_at DESC LIMIT 1`
    const result = await database.query(query)
    return result.rows.length > 0
  }

  /**
   * Private function to get the room the user is in. A user is connected to a room if:
   * - There's a user in the room with a connection interrupted more than VOICE_CHAT_CONNECTION_INTERRUPTED_TTL ago.
   * - There's a user in the room that left the room voluntarily.
   * @param userAddress - The address of the user to get the room for.
   * @param txClient - The transaction client to use.
   * @returns The room the user is in, or null if the user is not in a room.
   */
  async function _getRoomUserIsIn(userAddress: string, txClient?: PoolClient): Promise<string | null> {
    const query = SQL`SELECT roomName FROM voice_chat_users WHERE address = ${userAddress} AND (status = ${VoiceChatStatus.Connected} OR (status = ${VoiceChatStatus.ConnectionInterrupted} AND last_status_updated > ${new Date(Date.now() - VOICE_CHAT_CONNECTION_INTERRUPTED_TTL)})) ORDER BY status_updated_at DESC LIMIT 1`
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
  async function joinUserToRoom(userAddress: string, roomName: string): Promise<{ oldRoom: string | null }> {
    const now = new Date()
    return _executeTx(async (txClient) => {
      const roomUserIsIn = await _getRoomUserIsIn(userAddress, txClient)
      // If the user is in another room, disconnect them from the other room.
      if (roomUserIsIn !== null && roomUserIsIn !== roomName) {
        await _updateUserStatus(userAddress, roomUserIsIn, VoiceChatStatus.Disconnected, txClient)
      } else if (roomUserIsIn === roomName) {
        // The user is already in the room. Do nothing.
        return { oldRoom: roomName }
      }

      // Join the user to the new room.
      await txClient.query(
        SQL`INSERT INTO voice_chat_users (address, roomName, status, joined_at, status_updated_at) VALUES (${userAddress}, ${roomName}, ${VoiceChatStatus.Connected}, ${now}, ${now})`
      )

      return { oldRoom: roomUserIsIn }
    })
  }

  /**
   * Removes a user from a room. This is used when the user left the room voluntarily.
   * @param userAddress - The address of the user to remove from the room.
   * @param roomName - The name of the room to remove the user from.
   */
  async function removeUserFromRoom(userAddress: string, roomName: string): Promise<void> {
    return _updateUserStatus(userAddress, roomName, VoiceChatStatus.Disconnected)
  }

  /**
   * Disconnects a user from a room. This is used when the user's connection was interrupted.
   * @param userAddress - The address of the user to disconnect from the room.
   * @param roomName - The name of the room to disconnect the user from.
   */
  async function disconnectUserFromRoom(userAddress: string, roomName: string): Promise<void> {
    return _updateUserStatus(userAddress, roomName, VoiceChatStatus.ConnectionInterrupted)
  }

  return {
    hasRoomExpired,
    joinUserToRoom,
    removeUserFromRoom,
    disconnectUserFromRoom,
    getRoomUserIsIn
  }
}
