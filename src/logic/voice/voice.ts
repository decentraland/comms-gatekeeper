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
import {
  CommunityRole,
  CommunityVoiceChatUserMetadata,
  CommunityVoiceChatUserProfileMetadata
} from '../../types/social.type'
import { CommunityVoiceChatAction } from '../../types/community-voice'

export function createVoiceComponent(
  components: Pick<AppComponents, 'voiceDB' | 'logs' | 'livekit' | 'analytics'>
): IVoiceComponent {
  const { voiceDB, livekit, logs, analytics } = components
  const logger = logs.getLogger('voice')

  /**
   * Handles the event when a participant joins a PRIVATE voice chat room.
   * @param userAddress - The address of the user that joined the room.
   * @param roomName - The name of the room the user joined.
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
   * @param userAddress - The address of the user that left the room.
   * @param roomName - The name of the room the user left.
   * @param disconnectReason - The reason the user left the room.
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
        call_id: getCallIdFromRoomName(roomName),
        user_id: userAddress
      })

      // Remove the user from the room.
      return voiceDB.updateUserStatusAsDisconnected(userAddress, roomName)
    } else if (disconnectReason === DisconnectReason.ROOM_DELETED) {
      // If the room was deleted, remove the room from the database to prevent the room from being re-created.
      analytics.fireEvent(AnalyticsEvent.END_CALL, {
        room: getCallIdFromRoomName(roomName),
        address: userAddress
      })
      await voiceDB.deletePrivateVoiceChat(roomName)
      return
    }

    // Treat any other disconnections as abrupt disconnections.
    await voiceDB.updateUserStatusAsConnectionInterrupted(userAddress, roomName)
  }

  /**
   * Handles the event when a participant joins a COMMUNITY voice chat room.
   * @param userAddress - The address of the user that joined the room.
   * @param roomName - The name of the room the user joined.
   */
  async function handleCommunityParticipantJoined(userAddress: string, roomName: string): Promise<void> {
    logger.debug(`Community participant joined: ${userAddress} in room ${roomName}`)
    // Simply update the user status to connected
    await voiceDB.updateCommunityUserStatus(userAddress, roomName, VoiceChatUserStatus.Connected)
  }

  /**
   * Handles the event when a participant leaves a COMMUNITY voice chat room.
   * @param userAddress - The address of the user that left the room.
   * @param roomName - The name of the room the user left.
   * @param disconnectReason - The reason the user left the room.
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

      // Only check for room destruction when a moderator leaves voluntarily
      // Get all users to check if the leaving user was a moderator
      const usersInRoom = await voiceDB.getCommunityUsersInRoom(roomName)
      const leavingUser = usersInRoom.find((user) => user.address === userAddress)

      if (leavingUser?.isModerator) {
        logger.debug(`Moderator ${userAddress} left voluntarily, checking if room should be destroyed`)

        // Check immediately if there are any other active moderators remaining
        const now = Date.now()
        const remainingActiveModerators = usersInRoom.filter(
          (user) =>
            user.isModerator &&
            user.address !== userAddress && // Exclude the leaving user
            voiceDB.isActiveCommunityUser(user, now)
        )

        if (remainingActiveModerators.length === 0) {
          logger.debug(`No active moderators left in community room ${roomName}, destroying room`)
          await Promise.all([livekit.deleteRoom(roomName), voiceDB.deleteCommunityVoiceChat(roomName)])

          const communityId = getCommunityIdFromRoomName(roomName)
          analytics.fireEvent(AnalyticsEvent.END_CALL, {
            call_id: communityId
          })
        }
      }
    } else {
      await voiceDB.updateCommunityUserStatus(userAddress, roomName, VoiceChatUserStatus.ConnectionInterrupted)
    }
  }

  /**
   * Main handler that routes to private or community handlers based on room name.
   * @param userAddress - The address of the user that joined the room.
   * @param roomName - The name of the room the user joined.
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
   * @param userAddress - The address of the user that left the room.
   * @param roomName - The name of the room the user left.
   * @param disconnectReason - The reason the user left the room.
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
    const usersInRoom = await voiceDB.deletePrivateVoiceChatUserIsOrWasIn(roomName, address)
    await livekit.deleteRoom(roomName)
    return usersInRoom
  }

  /**
   * Deletes expired private voice chats.
   * Cleans up rooms that have become inactive due to connection timeouts or voluntary disconnections.
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

    if (expiredRoomNames.length > 0) {
      logger.info(`Deleted ${expiredRoomNames.length} expired private voice chats`)
    }
  }

  /**
   * Generates credentials for a community voice chat room with a specific role.
   * @param communityId - The ID of the community to generate credentials for.
   * @param userAddress - The address of the user.
   * @param userRole - The role of the user in the community.
   * @param profileData - Optional profile data for the user.
   * @param isCreating - Whether the user is creating the room (affects speaker status).
   * @returns The connection URL for the user.
   */
  async function getCommunityVoiceChatCredentialsWithRole(
    communityId: string,
    userAddress: string,
    userRole: CommunityRole,
    profileData?: CommunityVoiceChatUserProfileMetadata,
    action: CommunityVoiceChatAction = CommunityVoiceChatAction.JOIN
  ): Promise<{ connectionUrl: string }> {
    const roomName = getCommunityVoiceChatRoomName(communityId)

    // Determine if user is a speaker:
    // - Creator of the room is the only speaker by default
    const isSpeaker =
      action === CommunityVoiceChatAction.CREATE &&
      (userRole === CommunityRole.Moderator || userRole === CommunityRole.Owner)

    const metadata: CommunityVoiceChatUserMetadata = {
      role: userRole,
      isSpeaker
    }

    // Add profile data if provided
    if (profileData) {
      metadata.name = profileData.name
      metadata.hasClaimedName = profileData.hasClaimedName
      metadata.profilePictureUrl = profileData.profilePictureUrl
    }

    const roomKey = await livekit.generateCredentials(
      userAddress,
      roomName,
      {
        cast: [],
        canPublish: isSpeaker, // Speakers can publish, listeners need to be promoted
        canSubscribe: true,
        canUpdateOwnMetadata: false
      },
      false,
      metadata
    )

    // Join user to the community room
    await voiceDB.joinUserToCommunityRoom(
      userAddress,
      roomName,
      userRole === CommunityRole.Owner || userRole === CommunityRole.Moderator
    )

    return {
      connectionUrl: `livekit:${roomKey.url}?access_token=${roomKey.token}`
    }
  }

  /**
   * Deletes expired community voice chats.
   * This is the key function - runs every minute to check for rooms with no moderators for 5+ minutes.
   * Cleans up community rooms that have become inactive due to lack of moderation.
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
   * Uses stored database information about users joining/leaving to determine if the room is active.
   * Includes grace period for moderators who suffered connection interruptions.
   * @param communityId - The ID of the community to get the status for.
   * @returns The status information including active state, participant count, and moderator count.
   */
  async function getCommunityVoiceChatStatus(communityId: string): Promise<{
    active: boolean
    participantCount: number
    moderatorCount: number
  }> {
    const roomName = getCommunityVoiceChatRoomName(communityId)

    logger.debug(`Getting status for community voice chat: ${roomName}`)

    try {
      const isRoomActive = await voiceDB.isCommunityRoomActive(roomName)

      if (!isRoomActive) {
        logger.debug(`Community voice chat room ${roomName} is not active`)
        return {
          active: false,
          participantCount: 0,
          moderatorCount: 0
        }
      }

      // Count active participants using helper function
      const usersInRoom = await voiceDB.getCommunityUsersInRoom(roomName)
      const now = Date.now()

      const activeParticipants = usersInRoom.filter((user) => voiceDB.isActiveCommunityUser(user, now))

      // Count active moderators using helper function
      const activeModerators = usersInRoom.filter(
        (user) => user.isModerator && voiceDB.isActiveCommunityUser(user, now)
      )

      // Room is active if there are active moderators
      const active = activeModerators.length > 0

      logger.debug(
        `Community voice chat ${roomName} status: active=${active}, participants=${activeParticipants.length}, moderators=${activeModerators.length}`
      )

      return {
        active,
        participantCount: activeParticipants.length,
        moderatorCount: activeModerators.length
      }
    } catch (error) {
      logger.warn(
        `Error getting community voice chat status for ${roomName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      return {
        active: false,
        participantCount: 0,
        moderatorCount: 0
      }
    }
  }

  /**
   * Handles request to speak action for a community voice chat.
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user requesting to speak.
   */
  async function requestToSpeakInCommunity(communityId: string, userAddress: string): Promise<void> {
    const roomName = getCommunityVoiceChatRoomName(communityId)

    await livekit.updateParticipantMetadata(roomName, userAddress, {
      isRequestingToSpeak: true
    })

    logger.info(`Successfully updated metadata for user ${userAddress} in community ${communityId}`)
  }

  /**
   * Promotes a user to speaker in a community voice chat.
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user to promote.
   */
  async function promoteSpeakerInCommunity(communityId: string, userAddress: string): Promise<void> {
    const roomName = getCommunityVoiceChatRoomName(communityId)

    await livekit.updateParticipantPermissions(roomName, userAddress, {
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    })

    await livekit.updateParticipantMetadata(roomName, userAddress, {
      isRequestingToSpeak: false,
      isSpeaker: true
    })

    logger.info(`Successfully promoted user ${userAddress} to speaker in community ${communityId}`)
  }

  /**
   * Demotes a speaker to listener in a community voice chat.
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user to demote.
   */
  async function demoteSpeakerInCommunity(communityId: string, userAddress: string): Promise<void> {
    const roomName = getCommunityVoiceChatRoomName(communityId)

    await livekit.updateParticipantPermissions(roomName, userAddress, {
      canPublish: false,
      canSubscribe: true,
      canPublishData: true
    })

    await livekit.updateParticipantMetadata(roomName, userAddress, {
      isRequestingToSpeak: false,
      isSpeaker: false
    })

    logger.info(`Successfully demoted user ${userAddress} to listener in community ${communityId}`)
  }

  /**
   * Kicks a player from a community voice chat.
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user to kick.
   */
  async function kickPlayerFromCommunity(communityId: string, userAddress: string): Promise<void> {
    const roomName = getCommunityVoiceChatRoomName(communityId)

    await livekit.removeParticipant(roomName, userAddress)

    logger.info(`Successfully kicked user ${userAddress} from community ${communityId}`)
  }

  /**
   * Gets all active community voice chats.
   * @returns Array of active community voice chats with status information.
   */
  async function getAllActiveCommunityVoiceChats(): Promise<
    Array<{
      communityId: string
      participantCount: number
      moderatorCount: number
    }>
  > {
    logger.debug('Getting all active community voice chats')

    try {
      const activeChats = await voiceDB.getAllActiveCommunityVoiceChats()

      logger.debug(`Found ${activeChats.length} active community voice chats`)

      return activeChats
    } catch (error) {
      logger.warn(
        `Error getting all active community voice chats: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      return []
    }
  }

  return {
    isUserInVoiceChat,
    handleParticipantJoined,
    handleParticipantLeft,
    getPrivateVoiceChatRoomCredentials,
    endPrivateVoiceChat,
    expirePrivateVoiceChats,
    getCommunityVoiceChatCredentialsWithRole,
    expireCommunityVoiceChats,
    getCommunityVoiceChatStatus,
    requestToSpeakInCommunity,
    promoteSpeakerInCommunity,
    demoteSpeakerInCommunity,
    kickPlayerFromCommunity,
    getAllActiveCommunityVoiceChats
  }
}
