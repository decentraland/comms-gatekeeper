import { DisconnectReason } from '@livekit/protocol'
import { AppComponents } from '../../types'
import { IVoiceComponent } from './types'
import { LivekitCredentials } from '../../types/livekit.type'
import { getPrivateVoiceChatRoomName } from './utils'

export function createVoiceComponent(components: Pick<AppComponents, 'voiceDB' | 'logs' | 'livekit'>): IVoiceComponent {
  const { voiceDB, livekit, logs } = components
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

    // If the user was in another room, destroy the old room.
    if (oldRoom !== roomName) {
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
      return
    }

    if (disconnectReason === DisconnectReason.CLIENT_INITIATED) {
      // If the participant left willingly, we need to destroy the room to disconnect all users.
      // This is done because there are only two users in the room, but in the future we might have more users.
      await livekit.deleteRoom(roomName)
      // Remove the user from the room.
      return voiceDB.updateUserStatusAsDisconnected(userAddress, roomName)
    } else if (disconnectReason === DisconnectReason.ROOM_DELETED) {
      // If the room was deleted, remove the room from the database to prevent the room from being re-created.
      await voiceDB.deletePrivateVoiceChat(roomName, userAddress)
      return
    }

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
  ): Promise<Record<string, LivekitCredentials>> {
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
    await voiceDB.createVoiceChatRoom(roomName, userAddresses)
    return userAddresses.reduce(
      (acc, userAddress, index) => {
        acc[userAddress] = roomKeys[index]
        return acc
      },
      {} as Record<string, LivekitCredentials>
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
    const usersInRoom = await voiceDB.deletePrivateVoiceChat(roomName, address)
    await livekit.deleteRoom(roomName)
    return usersInRoom
  }

  return {
    endPrivateVoiceChat,
    isUserInVoiceChat,
    handleParticipantJoined,
    handleParticipantLeft,
    getPrivateVoiceChatRoomCredentials
  }
}
