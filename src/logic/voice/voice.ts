import { DisconnectReason } from '@livekit/protocol'
import { AppComponents } from '../../types'
import { IVoiceComponent } from './types'
import { getCallIdFromRoomName, getPrivateVoiceChatRoomName } from './utils'
import { AnalyticsEvent } from '../../types/analytics'

export function createVoiceComponent(
  components: Pick<AppComponents, 'voiceDB' | 'logs' | 'livekit' | 'analytics'>
): IVoiceComponent {
  const { voiceDB, livekit, logs, analytics } = components
  const logger = logs.getLogger('voice')

  /**
   * Handles the event when a participant joins a room.
   * @param userAddress - The address of the user that joined the room.
   * @param roomName - The name of the room the user joined.
   */
  async function handleParticipantJoined(userAddress: string, roomName: string) {
    // Check if the room is active.
    const isRoomActive = await voiceDB.isPrivateRoomActive(roomName)
    if (!isRoomActive) {
      logger.warn(`User ${userAddress} has joined an inactive room ${roomName}, destroying it`)

      // Destroy the room to disconnect the user.
      return livekit.deleteRoom(roomName)
    }

    // Join the user to the room.
    const { oldRoom } = await voiceDB.joinUserToRoom(userAddress, roomName)
    logger.debug(`User ${userAddress} joined the room ${roomName} - old room: ${oldRoom}`)

    // If the user was in another room, destroy the old room.
    if (oldRoom !== roomName) {
      logger.debug(`User ${userAddress} was in another room ${oldRoom}, destroying it`)
      await livekit.deleteRoom(oldRoom)
    }
  }

  /**
   * Handles the event when a participant leaves a room.
   * @param userAddress - The address of the user that left the room.
   * @param roomName - The name of the room the user left.
   * @param disconnectReason - The reason the user left the room.
   */
  async function handleParticipantLeft(userAddress: string, roomName: string, disconnectReason: DisconnectReason) {
    // If the user disconnected because of a duplicate identity, do nothing. They're re-joining the room.
    if (disconnectReason === DisconnectReason.DUPLICATE_IDENTITY) {
      logger.debug(`User ${userAddress} left the room ${roomName} because of a duplicate identity`)
      return
    }

    // If the participant left willingly, we need to destroy the room to disconnect all users.
    if (disconnectReason === DisconnectReason.CLIENT_INITIATED) {
      // As room only has two users up to know (private voice chats), if a user leaves a room willingly,
      // we need to destroy the room to disconnect all users.
      logger.debug(`User ${userAddress} left the room ${roomName} because of a client initiated disconnect`)
      await livekit.deleteRoom(roomName)

      analytics.fireEvent(AnalyticsEvent.END_CALL, {
        call_id: getCallIdFromRoomName(roomName),
        user_id: userAddress
      })

      // Remove the user from the room.
      return voiceDB.updateUserStatusAsDisconnected(userAddress, roomName)
    } else if (disconnectReason === DisconnectReason.ROOM_DELETED) {
      // If the room was deleted, remove the room from the database to prevent the room from being re-created.
      logger.debug(`User ${userAddress} left the room ${roomName} because the room was deleted`)
      await voiceDB.deletePrivateVoiceChat(roomName)
      return
    }

    logger.debug(`User ${userAddress} left the room ${roomName} because of another disconnect reason`)
    // Treat any other disconnections as abrupt disconnections.
    await voiceDB.updateUserStatusAsConnectionInterrupted(userAddress, roomName)
  }

  /**
   * Checks if a user is in a voice chat.
   * @param userAddress - The address of the user to check.
   * @returns True if the user is in a voice chat, false otherwise.
   */
  async function isUserInVoiceChat(userAddress: string): Promise<boolean> {
    const roomUserIsIn = await voiceDB.getRoomUserIsIn(userAddress)
    return roomUserIsIn !== null
  }

  /**
   * Generates credentials for a private voice chat room.
   * @param roomId - The ID suffix of the room to generate credentials for.
   * @param userAddresses - The addresses of the users to generate credentials for.
   * @returns A record of user addresses and their credentials.
   */
  async function getPrivateVoiceChatRoomCredentials(
    roomId: string,
    userAddresses: string[]
  ): Promise<Record<string, { connectionUrl: string }>> {
    const roomName = getPrivateVoiceChatRoomName(roomId)
    // Generate credentials for each user.
    const roomKeys = await Promise.all(
      userAddresses.map(async (userAddress) => {
        const roomKey = await livekit.generateCredentials(
          userAddress,
          roomName,
          {
            cast: [],
            canPublish: true,
            canSubscribe: true,
            canUpdateOwnMetadata: false
          },
          false
        )
        return roomKey
      })
    )
    // Create the room in the database.
    logger.debug(`Creating room ${roomName} for users ${userAddresses.join(', ')}`)
    await voiceDB.createVoiceChatRoom(roomName, userAddresses)
    return userAddresses.reduce(
      (acc, userAddress, index) => {
        acc[userAddress] = { connectionUrl: livekit.buildConnectionUrl(roomKeys[index].url, roomKeys[index].token) }
        return acc
      },
      {} as Record<string, { connectionUrl: string }>
    )
  }

  /**
   * Ends a private voice chat room.
   * @param roomId - The ID suffix of the room to end.
   * @param address - The address of the user to end the private voice chat for.
   * @returns The addresses of the users that were in the deleted room.
   */
  async function endPrivateVoiceChat(roomId: string, address: string): Promise<string[]> {
    const roomName = getPrivateVoiceChatRoomName(roomId)
    logger.debug(`Ending private voice chat for room ${roomName}`)
    const usersInRoom = await voiceDB.deletePrivateVoiceChatUserIsOrWasIn(roomName, address)
    logger.debug(`Deleted private voice chat for room ${roomName}`)
    await livekit.deleteRoom(roomName)
    return usersInRoom
  }

  /**
   * Deletes expired private voice chats.
   */
  async function expirePrivateVoiceChats() {
    const expiredRoomNames = await voiceDB.deleteExpiredPrivateVoiceChats()
    // Delete the expired rooms from LiveKit.
    for (const roomName of expiredRoomNames) {
      analytics.fireEvent(AnalyticsEvent.EXPIRE_CALL, {
        call_id: getCallIdFromRoomName(roomName)
      })
      logger.debug(`Deleting expired room ${roomName}`)
      await livekit.deleteRoom(roomName)
    }

    if (expiredRoomNames.length > 0) {
      logger.info(`Deleted ${expiredRoomNames.length} expired private voice chats`)
    }
  }

  return {
    expirePrivateVoiceChats,
    endPrivateVoiceChat,
    isUserInVoiceChat,
    handleParticipantJoined,
    handleParticipantLeft,
    getPrivateVoiceChatRoomCredentials
  }
}
