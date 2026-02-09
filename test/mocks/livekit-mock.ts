import { ILivekitComponent } from '../../src/types/livekit.type'
import {
  COMMUNITY_VOICE_CHAT_ROOM_PREFIX,
  ISLAND_ROOM_PREFIX,
  PRIVATE_VOICE_CHAT_ROOM_PREFIX
} from '../../src/adapters/livekit'

export const createLivekitMockedComponent = (
  overrides?: Partial<jest.Mocked<ILivekitComponent>>
): jest.Mocked<ILivekitComponent> => {
  return {
    deleteRoom: jest.fn(),
    buildConnectionUrl: jest.fn(),
    generateCredentials: jest.fn(),
    muteParticipant: jest.fn(),
    removeParticipant: jest.fn(),
    getWorldRoomName: jest.fn(),
    getWorldSceneRoomName: jest.fn(),
    getSceneRoomName: jest.fn(),
    getPrivateVoiceChatRoomName: jest
      .fn()
      .mockImplementation((roomId: string) => `${PRIVATE_VOICE_CHAT_ROOM_PREFIX}${roomId}`),
    getCallIdFromRoomName: jest
      .fn()
      .mockImplementation((roomName: string) => roomName.replace(PRIVATE_VOICE_CHAT_ROOM_PREFIX, '')),
    getCommunityVoiceChatRoomName: jest
      .fn()
      .mockImplementation((communityId: string) => `${COMMUNITY_VOICE_CHAT_ROOM_PREFIX}-${communityId}`),
    getCommunityIdFromRoomName: jest
      .fn()
      .mockImplementation((roomName: string) => roomName.replace(`${COMMUNITY_VOICE_CHAT_ROOM_PREFIX}-`, '')),
    getIslandNameFromRoomName: jest
      .fn()
      .mockImplementation((roomName: string) => roomName.replace(ISLAND_ROOM_PREFIX, '')),
    getRoomName: jest.fn(),
    getRoomMetadataFromRoomName: jest.fn(),
    getRoom: jest.fn(),
    getRoomInfo: jest.fn(),
    getOrCreateIngress: jest.fn(),
    removeIngress: jest.fn(),
    getWebhookEvent: jest.fn(),
    getParticipantInfo: jest.fn(),
    listRoomParticipants: jest.fn(),
    updateParticipantMetadata: jest.fn(),
    updateParticipantPermissions: jest.fn(),
    updateRoomMetadata: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    ...overrides
  }
}
