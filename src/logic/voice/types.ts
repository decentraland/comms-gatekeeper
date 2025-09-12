import { DisconnectReason } from '@livekit/protocol'
import { CommunityRole, CommunityVoiceChatUserProfile } from '../../types/social.type'
import { CommunityVoiceChatAction } from '../../types/community-voice'

export interface IVoiceComponent {
  /**
   * Checks if a user is in a voice chat.
   * @param userAddress - The address of the user to check.
   * @returns True if the user is in a voice chat, false otherwise.
   */
  isUserInVoiceChat(userAddress: string): Promise<boolean>

  /**
   * Handles the event when a participant leaves a room.
   * @param userAddress - The address of the user that left the room.
   * @param roomName - The name of the room the user left.
   * @param disconnectReason - The reason the user left the room.
   */
  handleParticipantLeft(userAddress: string, roomName: string, disconnectReason: DisconnectReason): Promise<void>

  /**
   * Handles the event when a participant joins a room.
   * @param userAddress - The address of the user that joined the room.
   * @param roomName - The name of the room the user joined.
   */
  handleParticipantJoined(userAddress: string, roomName: string): Promise<void>

  /**
   * Generates credentials for a private voice chat room.
   * @param roomId - The ID suffix of the room to generate credentials for.
   * @param userAddresses - The addresses of the users to generate credentials for.
   * @returns A record of user addresses and their credentials.
   */
  getPrivateVoiceChatRoomCredentials(
    roomId: string,
    userAddresses: string[]
  ): Promise<Record<string, { connectionUrl: string }>>

  /**
   * Ends a private voice chat room.
   * @param roomId - The ID suffix of the room to end.
   * @param address - The address of the user to end the private voice chat for.
   * @returns The addresses of the users that were in the deleted room.
   */
  endPrivateVoiceChat(roomId: string, address: string): Promise<string[]>

  /**
   * Deletes expired private voice chats.
   */
  expirePrivateVoiceChats(): Promise<void>

  /**
   * Generates credentials for a community voice chat room with a specific role.
   * @param communityId - The ID of the community to generate credentials for.
   * @param userAddress - The address of the user.
   * @param userRole - The role of the user in the community.
   * @param profileData - Optional profile data for the user.
   * @param action - The action the user is performing (affects speaker status).
   * @returns The connection URL for the user.
   */
  getCommunityVoiceChatCredentialsWithRole(
    communityId: string,
    userAddress: string,
    userRole: CommunityRole,
    profileData?: CommunityVoiceChatUserProfile,
    action?: CommunityVoiceChatAction
  ): Promise<{ connectionUrl: string }>

  /**
   * Deletes expired community voice chats.
   */
  expireCommunityVoiceChats(): Promise<void>

  /**
   * Gets the status of a community voice chat.
   * @param communityId - The ID of the community to check.
   * @returns Status information including if it's active and participant counts.
   */
  getCommunityVoiceChatStatus(communityId: string): Promise<{
    active: boolean
    participantCount: number
    moderatorCount: number
  }>

  /**
   * Handles request to speak action for a community voice chat.
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user requesting to speak.
   */
  requestToSpeakInCommunity(communityId: string, userAddress: string): Promise<void>

  /**
   * Rejects a speak request for a community voice chat.
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user whose speak request is being rejected.
   */
  rejectSpeakRequestInCommunity(communityId: string, userAddress: string): Promise<void>

  /**
   * Promotes a user to speaker in a community voice chat.
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user to promote.
   */
  promoteSpeakerInCommunity(communityId: string, userAddress: string): Promise<void>

  /**
   * Demotes a speaker to listener in a community voice chat.
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user to demote.
   */
  demoteSpeakerInCommunity(communityId: string, userAddress: string): Promise<void>

  /**
   * Kicks a player from a community voice chat.
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user to kick.
   */
  kickPlayerFromCommunity(communityId: string, userAddress: string): Promise<void>

  /**
   * Ends a community voice chat (force end regardless of participants).
   * @param communityId - The ID of the community.
   * @param userAddress - The address of the user ending the chat.
   */
  endCommunityVoiceChat(communityId: string, userAddress: string): Promise<void>

  /**
   * Gets all active community voice chats.
   * @returns Array of active community voice chats with status information.
   */
  getAllActiveCommunityVoiceChats(): Promise<
    Array<{
      communityId: string
      participantCount: number
      moderatorCount: number
    }>
  >

  /**
   * Checks if a user is currently in any community voice chat.
   * @param userAddress - The address of the user to check
   * @returns Promise<boolean> - True if user is in a community voice chat, false otherwise
   */
  isUserInCommunityVoiceChat(userAddress: string): Promise<boolean>
}
