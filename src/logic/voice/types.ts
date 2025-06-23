import { DisconnectReason } from '@livekit/protocol'

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
}
