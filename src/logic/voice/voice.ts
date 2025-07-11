import { DisconnectReason } from '@livekit/protocol'
import { AppComponents } from '../../types'
import { IVoiceComponent } from './types'
import {
  getCallIdFromRoomName,
  getPrivateVoiceChatRoomName,
  getCommunityVoiceChatRoomName,
  getCommunityIdFromRoomName
} from './utils'
import { AnalyticsEvent } from '../../types/analytics'
import { VoiceChatUserStatus } from '../../adapters/db/types'
import { CommunityRole } from '../../types/social.type'

export function createVoiceComponent(
  components: Pick<AppComponents, 'voiceDB' | 'logs' | 'livekit' | 'analytics'>
): IVoiceComponent {
  const { voiceDB, livekit, logs, analytics } = components
  const logger = logs.getLogger('voice')

  /**
   * Handles the event when a participant joins a PRIVATE voice chat room.
   */
  async function handlePrivateParticipantJoined(userAddress: string, roomName: string): Promise<void> {
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
   * Handles the event when a participant leaves a PRIVATE voice chat room.
   */
  async function handlePrivateParticipantLeft(
    userAddress: string,
    roomName: string,
    disconnectReason: DisconnectReason
  ): Promise<void> {
    // If the user disconnected because of a duplicate identity, do nothing. They're re-joining the room.
    if (disconnectReason === DisconnectReason.DUPLICATE_IDENTITY) {
      return
    }

    // If the participant left willingly, we need to destroy the room to disconnect all users.
    if (disconnectReason === DisconnectReason.CLIENT_INITIATED) {
      // As room only has two users up to know (private voice chats), if a user leaves a room willingly,
      // we need to destroy the room to disconnect all users.
      await livekit.deleteRoom(roomName)

      analytics.fireEvent(AnalyticsEvent.END_CALL, {
        room: getCallIdFromRoomName(roomName),
        address: userAddress
      })

      // Remove the user from the room.
      return voiceDB.updateUserStatusAsDisconnected(userAddress, roomName)
    } else if (disconnectReason === DisconnectReason.ROOM_DELETED) {
      // If the room was deleted, remove the room from the database to prevent the room from being re-created.
      analytics.fireEvent(AnalyticsEvent.END_CALL, {
        room: getCallIdFromRoomName(roomName),
        address: userAddress
      })
      await voiceDB.deletePrivateVoiceChat(roomName, userAddress)
      return
    }

    // Treat any other disconnections as abrupt disconnections.
    await voiceDB.updateUserStatusAsConnectionInterrupted(userAddress, roomName)
  }

  /**
   * Handles the event when a participant joins a COMMUNITY voice chat room.
   */
  async function handleCommunityParticipantJoined(userAddress: string, roomName: string): Promise<void> {
    logger.debug(`Community participant joined: ${userAddress} in room ${roomName}`)
    // Simply update the user status to connected
    await voiceDB.updateCommunityUserStatus(userAddress, roomName, VoiceChatUserStatus.Connected)
  }

  /**
   * Handles the event when a participant leaves a COMMUNITY voice chat room.
   */
  async function handleCommunityParticipantLeft(
    userAddress: string,
    roomName: string,
    disconnectReason: DisconnectReason
  ): Promise<void> {
    logger.debug(`Community participant left: ${userAddress} in room ${roomName}, reason: ${disconnectReason}`)

    if (disconnectReason === DisconnectReason.DUPLICATE_IDENTITY) {
      logger.debug('Ignoring disconnect due to duplicate identity')
      return
    }

    if (disconnectReason === DisconnectReason.ROOM_DELETED) {
      await voiceDB.deleteCommunityVoiceChat(roomName)
      return
    }

    // Update user status based on disconnect reason
    if (disconnectReason === DisconnectReason.CLIENT_INITIATED) {
      await voiceDB.updateCommunityUserStatus(userAddress, roomName, VoiceChatUserStatus.Disconnected)
    } else {
      await voiceDB.updateCommunityUserStatus(userAddress, roomName, VoiceChatUserStatus.ConnectionInterrupted)
    }

    // Check if community room should be destroyed (no moderators for 5 mins)
    // NOTE: This only triggers when someone disconnects. The main cleanup is handled by expireCommunityVoiceChats job
    if (await voiceDB.shouldDestroyCommunityRoom(roomName)) {
      logger.debug(`Community room ${roomName} should be destroyed, deleting from livekit`)
      await livekit.deleteRoom(roomName)
      await voiceDB.deleteCommunityVoiceChat(roomName)

      const communityId = getCommunityIdFromRoomName(roomName)
      analytics.fireEvent(AnalyticsEvent.EXPIRE_CALL, {
        call_id: communityId
      })
    }
  }

  /**
   * Main handler that routes to private or community handlers based on room name.
   */
  async function handleParticipantJoined(userAddress: string, roomName: string): Promise<void> {
    if (roomName.startsWith('voice-chat-private-')) {
      await handlePrivateParticipantJoined(userAddress, roomName)
    } else if (roomName.startsWith('voice-chat-community-')) {
      await handleCommunityParticipantJoined(userAddress, roomName)
    } else {
      logger.warn(`Unknown room type for participant joined: ${roomName}`)
    }
  }

  /**
   * Main handler that routes to private or community handlers based on room name.
   */
  async function handleParticipantLeft(
    userAddress: string,
    roomName: string,
    disconnectReason: DisconnectReason
  ): Promise<void> {
    if (roomName.startsWith('voice-chat-private-')) {
      await handlePrivateParticipantLeft(userAddress, roomName, disconnectReason)
    } else if (roomName.startsWith('voice-chat-community-')) {
      await handleCommunityParticipantLeft(userAddress, roomName, disconnectReason)
    } else {
      logger.warn(`Unknown room type for participant left: ${roomName}`)
    }
  }

  /**
   * Checks if a user is in a voice chat.
   */
  async function isUserInVoiceChat(userAddress: string): Promise<boolean> {
    const roomUserIsIn = await voiceDB.getRoomUserIsIn(userAddress)
    return roomUserIsIn !== null
  }

  /**
   * Generates credentials for a private voice chat room.
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
   */
  async function endPrivateVoiceChat(roomId: string, address: string): Promise<string[]> {
    const roomName = getPrivateVoiceChatRoomName(roomId)
    const usersInRoom = await voiceDB.deletePrivateVoiceChat(roomName, address)
    await livekit.deleteRoom(roomName)
    return usersInRoom
  }

  /**
   * Deletes expired private voice chats.
   */
  async function expirePrivateVoiceChats(): Promise<void> {
    const expiredRoomNames = await voiceDB.deleteExpiredPrivateVoiceChats()
    // Delete the expired rooms from LiveKit.
    for (const roomName of expiredRoomNames) {
      analytics.fireEvent(AnalyticsEvent.EXPIRE_CALL, {
        call_id: getCallIdFromRoomName(roomName)
      })
      await livekit.deleteRoom(roomName)
    }
  }

  /**
   * Generates credentials for a community voice chat room for a moderator.
   */
  async function getCommunityVoiceChatCredentialsForModerator(
    communityId: string,
    userAddress: string
  ): Promise<{ connectionUrl: string }> {
    const roomName = getCommunityVoiceChatRoomName(communityId)

    // Ensure the room exists in LiveKit (creates it if it doesn't exist)
    await livekit.getRoom(roomName)

    const roomKey = await livekit.generateCredentials(
      userAddress,
      roomName,
      {
        cast: [],
        canPublish: true,
        canSubscribe: true,
        canUpdateOwnMetadata: false
      },
      false,
      {
        role: CommunityRole.Moderator,
        community_id: communityId
      }
    )

    // Create or update moderator in the community room
    await voiceDB.joinUserToCommunityRoom(userAddress, roomName, true)

    return {
      connectionUrl: `livekit:${roomKey.url}?access_token=${roomKey.token}`
    }
  }

  /**
   * Generates credentials for a community voice chat room for a member.
   */
  async function getCommunityVoiceChatCredentialsForMember(
    communityId: string,
    userAddress: string
  ): Promise<{ connectionUrl: string }> {
    const roomName = getCommunityVoiceChatRoomName(communityId)

    const roomKey = await livekit.generateCredentials(
      userAddress,
      roomName,
      {
        cast: [],
        canPublish: false, // can't publish until they are promoted
        canSubscribe: true,
        canUpdateOwnMetadata: false
      },
      false,
      {
        role: CommunityRole.Member,
        community_id: communityId
      }
    )

    // Add member to the community room
    await voiceDB.joinUserToCommunityRoom(userAddress, roomName, false)

    return {
      connectionUrl: `livekit:${roomKey.url}?access_token=${roomKey.token}`
    }
  }

  /**
   * Deletes expired community voice chats.
   * THIS IS THE KEY FUNCTION - runs every minute to check for rooms with no moderators for 5+ minutes
   */
  async function expireCommunityVoiceChats(): Promise<void> {
    logger.debug('Running community voice chat expiration job')
    const expiredRoomNames = await voiceDB.deleteExpiredCommunityVoiceChats()

    logger.debug(`Found ${expiredRoomNames.length} expired community voice chat rooms`)

    // Delete the expired rooms from LiveKit.
    for (const roomName of expiredRoomNames) {
      const communityId = getCommunityIdFromRoomName(roomName)
      logger.info(`Expiring community voice chat room: ${roomName} (community: ${communityId})`)

      analytics.fireEvent(AnalyticsEvent.EXPIRE_CALL, {
        call_id: communityId
      })

      await livekit.deleteRoom(roomName)
    }
  }

  /**
   * Gets the status of a community voice chat.
   */
  async function getCommunityVoiceChatStatus(communityId: string): Promise<{
    active: boolean
    participantCount: number
    moderatorCount: number
  }> {
    const roomName = getCommunityVoiceChatRoomName(communityId)

    logger.debug(`Getting status for community voice chat: ${roomName}`)

    // Get room info from LiveKit
    const roomInfo = await livekit.getRoomInfo(roomName)
    console.log('roomInfo', roomInfo)

    if (!roomInfo) {
      logger.debug(`Community voice chat room ${roomName} not found in LiveKit`)
      return {
        active: false,
        participantCount: 0,
        moderatorCount: 0
      }
    }

    // Count participants from LiveKit room data
    const participantCount = roomInfo.numParticipants || 0

    // For now, just check if room exists in LiveKit - simplified logic
    const active = true // If room exists in LiveKit, it's active

    logger.debug(`Community voice chat ${roomName} status: active=${active}, participants=${participantCount}`)

    return {
      active,
      participantCount,
      moderatorCount: 0 // We'll implement this later
    }
  }

  return {
    isUserInVoiceChat,
    handleParticipantJoined,
    handleParticipantLeft,
    getPrivateVoiceChatRoomCredentials,
    endPrivateVoiceChat,
    expirePrivateVoiceChats,
    getCommunityVoiceChatCredentialsForModerator,
    getCommunityVoiceChatCredentialsForMember,
    expireCommunityVoiceChats,
    getCommunityVoiceChatStatus
  }
}
