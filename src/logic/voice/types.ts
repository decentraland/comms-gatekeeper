import { DisconnectReason } from '@livekit/protocol'
import { CommunityVoiceChatUserProfileMetadata } from '../../types/social.type'

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
   * Generates credentials for a community voice chat room for a moderator.
   * @param communityId - The ID of the community to generate credentials for.
   * @param userAddress - The address of the moderator.
   * @param profileData - Optional profile data for the moderator.
   * @returns The connection URL for the moderator.
   */
  getCommunityVoiceChatCredentialsForModerator(
    communityId: string,
    userAddress: string,
    profileData?: CommunityVoiceChatUserProfileMetadata
  ): Promise<{ connectionUrl: string }>

  /**
   * Generates credentials for a community voice chat room for a member.
   * @param communityId - The ID of the community to generate credentials for.
   * @param userAddress - The address of the member.
   * @param profileData - Optional profile data for the member.
   * @returns The connection URL for the member.
   */
  getCommunityVoiceChatCredentialsForMember(
    communityId: string,
    userAddress: string,
    profileData?: CommunityVoiceChatUserProfileMetadata
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
}
