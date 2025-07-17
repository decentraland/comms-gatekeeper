import { ILivekitComponent } from '../../src/types/livekit.type'

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
    getSceneRoomName: jest.fn(),
    getRoom: jest.fn(),
    getRoomInfo: jest.fn(),
    getOrCreateIngress: jest.fn(),
    removeIngress: jest.fn(),
    getWebhookEvent: jest.fn(),
    getParticipantInfo: jest.fn(),
    updateParticipantMetadata: jest.fn(),
    updateParticipantPermissions: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    ...overrides
  }
}
