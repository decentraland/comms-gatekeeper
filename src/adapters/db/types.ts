export enum VoiceChatStatus {
  // The user is connected to the room.
  Connected = 'connected',
  // The user's connection was interrupted.
  ConnectionInterrupted = 'connection_interrupted',
  // The user left the room voluntarily. This is the default status.
  Disconnected = 'disconnected'
}

export interface IVoiceDBComponent {
  /**
   * Checks if a room has expired. A room is expired if:
   * - There's a user in the room with a connection interrupted more than VOICE_CHAT_CONNECTION_INTERRUPTED_TTL ago.
   * - There's a user in the room that left the room voluntarily.
   * @param roomName - The name of the room to check.
   * @returns True if the room has expired, false otherwise.
   */
  hasRoomExpired: (roomName: string) => Promise<boolean>
  /**
   * Joins a user to a room. If the user is already in a room, disconnects them from the other room.
   * @param userAddress - The address of the user to join to the room.
   * @param roomName - The name of the room to join the user to.
   * @returns The room the user was in before joining the new room, or null if the user was not in a room.
   */
  joinUserToRoom: (userAddress: string, roomName: string) => Promise<{ oldRoom: string | null }>

  /**
   * Removes a user from a room. This is used when the user left the room voluntarily.
   * @param userAddress - The address of the user to remove from the room.
   * @param roomName - The name of the room to remove the user from.
   */
  removeUserFromRoom: (userAddress: string, roomName: string) => Promise<void>

  /**
   * Disconnects a user from a room. This is used when the user's connection was interrupted.
   * @param userAddress - The address of the user to disconnect from the room.
   * @param roomName - The name of the room to disconnect the user from.
   */
  disconnectUserFromRoom: (userAddress: string, roomName: string) => Promise<void>

  /**
   * Gets the room the user is in. A user is connected to a room if:
   * - There's a user in the room with a connection interrupted more than VOICE_CHAT_CONNECTION_INTERRUPTED_TTL ago.
   * - There's a user in the room that left the room voluntarily.
   * @param userAddress - The address of the user to get the room for.
   * @returns The room the user is in, or null if the user is not in a room.
   */
  getRoomUserIsIn: (userAddress: string) => Promise<string | null>
}
