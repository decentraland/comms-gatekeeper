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
   * @param roomName - The name of the room to remove.
   * @param address - The address of the user to remove from the room.
   * @returns The addresses of the users that were in the deleted room.
   */
  deletePrivateVoiceChat: (roomName: string, address: string) => Promise<string[]>

  /**
   * Gets the users in a room.
   * @param roomName - The name of the room to get the users for.
   * @returns The users in the room.
   */
  getUsersInRoom: (roomName: string) => Promise<VoiceChatUser[]>
}
