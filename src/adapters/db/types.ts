export enum VoiceChatUserStatus {
  // The user is connected to the room.
  Connected = 'connected',
  // The user's connection was interrupted.
  ConnectionInterrupted = 'connection_interrupted',
  // The user left the room voluntarily. This is the default status.
  Disconnected = 'disconnected',
  // Not connected yet.
  NotConnected = 'not_connected'
}

export interface VoiceChatUser {
  address: string
  status: VoiceChatUserStatus
  roomName: string
  joinedAt: number
  statusUpdatedAt: number
}

export interface CommunityVoiceChatUser {
  address: string
  status: VoiceChatUserStatus
  roomName: string
  isModerator: boolean
  joinedAt: number
  statusUpdatedAt: number
}

export interface IVoiceDBComponent {
  /**
   * Checks if a private room is active. A private room is active if:
   * - There are two or more users in the room that were not timed out due to a connection interruption.
   * - There are two or more users in the room that were not timed out due to not having initially connected.
   * - There are more than one user in the room that didn't left the room voluntarily.
   * - There are two or more users in the room that are connected.
   * @param roomName - The name of the room to check.
   * @returns True if the room is active, false otherwise.
   */
  isPrivateRoomActive(roomName: string): Promise<boolean>

  /**
   * Joins a user to a room. If the user is already in a room, disconnects them from the other room.
   * @param userAddress - The address of the user to join to the room.
   * @param roomName - The name of the room to join the user to.
   * @returns The room the user was in before joining the new room.
   */
  joinUserToRoom: (userAddress: string, roomName: string) => Promise<{ oldRoom: string }>

  /**
   * Updates the status of a user in a room to disconnected. This is used when the user left the room voluntarily.
   * @param userAddress - The address of the user to remove from the room.
   * @param roomName - The name of the room to remove the user from.
   */
  updateUserStatusAsDisconnected: (userAddress: string, roomName: string) => Promise<void>

  /**
   * Updates the status of a user in a room to connection interrupted. This is used when the user's connection was interrupted.
   * @param userAddress - The address of the user to disconnect from the room.
   * @param roomName - The name of the room to disconnect the user from.
   */
  updateUserStatusAsConnectionInterrupted: (userAddress: string, roomName: string) => Promise<void>

  /**
   * Gets the room the user is in. A user is connected to a room if:
   * - There's a user in the room with a connection interrupted more than VOICE_CHAT_CONNECTION_INTERRUPTED_TTL ago.
   * - There's a user in the room that left the room voluntarily.
   * @param userAddress - The address of the user to get the room for.
   * @returns The room the user is in, or null if the user is not in a room.
   */
  getRoomUserIsIn: (userAddress: string) => Promise<string | null>

  /**
   * Creates a voice chat room and set the users into the room. The users are set to not connected.
   * @param roomName - The name of the room to create.
   * @param userAddresses - The addresses of the users to create the room for.
   */
  createVoiceChatRoom: (roomName: string, userAddresses: string[]) => Promise<void>

  /**
   * Deletes a private voice chat from the database by removing all users from the room.
   * If the given address is or was not in the room, an error is thrown.
   * @param roomName - The name of the room to remove.
   * @param address - An address of an user that was or is in the room.
   * @returns The addresses of the users that were in the deleted room.
   */
  deletePrivateVoiceChatUserIsOrWasIn: (roomName: string, address: string) => Promise<string[]>

  /**
   * Gets the users in a room.
   * @param roomName - The name of the room to get the users for.
   * @returns The users in the room.
   */
  getUsersInRoom: (roomName: string) => Promise<VoiceChatUser[]>

  /**
   * Deletes expired private voice chats and returns the names of the rooms that were deleted.
   * A private voice chat is expired if:
   * - There's a user in the room that left the room voluntarily.
   * - There's a user in the room with a connection interrupted more than VOICE_CHAT_CONNECTION_INTERRUPTED_TTL ago.
   * - There's a user in the room that was not connected to the room for more than VOICE_CHAT_INITIAL_CONNECTION_TTL ago.
   * Room where the users left voluntarily should not be returned, as they have already been deleted in LiveKit.
   * @returns The names of the rooms that were deleted when the users were in the rooms.
   */
  deleteExpiredPrivateVoiceChats: () => Promise<string[]>

  /**
   * Deletes a private voice chat room from the database without any checks.
   * @param roomName - The name of the room to delete.
   */
  deletePrivateVoiceChat: (roomName: string) => Promise<void>

  // Community voice chat methods
  /**
   * Joins a user to a community voice chat room.
   * @param userAddress - The address of the user to join.
   * @param roomName - The name of the community room.
   * @param isModerator - Whether the user is a moderator.
   */
  joinUserToCommunityRoom: (userAddress: string, roomName: string, isModerator?: boolean) => Promise<void>

  /**
   * Updates the status of a user in a community room.
   * @param userAddress - The address of the user to update the status for.
   * @param roomName - The name of the community room.
   * @param status - The new status of the user.
   */
  updateCommunityUserStatus: (userAddress: string, roomName: string, status: VoiceChatUserStatus) => Promise<void>

  /**
   * Gets users in a community voice chat room.
   * @param roomName - The name of the community room.
   * @returns The users in the community room.
   */
  getCommunityUsersInRoom: (roomName: string) => Promise<CommunityVoiceChatUser[]>

  /**
   * Checks if a community room is active (has active moderators).
   * @param roomName - The name of the community room.
   * @returns True if the room is active, false otherwise.
   */
  isCommunityRoomActive: (roomName: string) => Promise<boolean>

  /**
   * Gets the total participant count for a community voice chat room.
   * This is optimized to only return the count without loading all user data.
   * @param roomName - The name of the community room.
   * @returns The total number of participants in the room.
   */
  getCommunityVoiceChatParticipantCount: (roomName: string) => Promise<number>

  /**
   * Deletes a community voice chat room.
   * @param roomName - The name of the community room.
   */
  deleteCommunityVoiceChat: (roomName: string) => Promise<void>

  /**
   * Deletes expired community voice chats and returns the names of the rooms that were deleted.
   * @returns The names of the rooms that were deleted.
   */
  deleteExpiredCommunityVoiceChats: () => Promise<string[]>

  /**
   * Gets all active community voice chat rooms with their community IDs.
   * @returns Array of objects with communityId and status information.
   */
  getAllActiveCommunityVoiceChats: () => Promise<
    Array<{
      communityId: string
      participantCount: number
      moderatorCount: number
    }>
  >

  /**
   * Checks if a user is currently in any community voice chat room.
   * @param userAddress - The address of the user to check.
   * @returns True if the user is in any community voice chat, false otherwise.
   */
  isUserInAnyCommunityVoiceChat: (userAddress: string) => Promise<boolean>

  /**
   * Helper function to determine if a community user is currently active.
   * @param user - The community user to check.
   * @param now - Current timestamp in milliseconds.
   * @returns True if the user is active, false otherwise.
   */
  isActiveCommunityUser: (user: CommunityVoiceChatUser, now: number) => boolean

  /**
   * Gets the status of multiple community voice chats in a single efficient query.
   * @param communityIds - Array of community IDs to get status for.
   * @returns Array of status objects for each community, including inactive ones.
   */
  getBulkCommunityVoiceChatStatus: (communityIds: string[]) => Promise<
    Array<{
      communityId: string
      active: boolean
      participantCount: number
      moderatorCount: number
    }>
  >

  /**
   * Gets the total participant count (all participants, not just active) for a batch of community voice chats.
   * This is optimized for bulk queries and counts all participants regardless of their status.
   * @param communityIds - Array of community IDs to get participant counts for.
   * @returns Map of room name to total participant count.
   */
  getBulkCommunityVoiceChatParticipantCount: (communityIds: string[]) => Promise<Map<string, number>>
}
