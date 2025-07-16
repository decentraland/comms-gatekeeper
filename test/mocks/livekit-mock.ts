import { ILivekitComponent } from '../../src/types/livekit.type'

export const createLivekitMockedComponent = (
  overrides?: Partial<jest.Mocked<ILivekitComponent>>
): jest.Mocked<ILivekitComponent> => {
  return {
    deleteRoom: overrides?.deleteRoom ?? jest.fn(),
    generateCredentials: overrides?.generateCredentials ?? jest.fn(),
    buildConnectionUrl: overrides?.buildConnectionUrl ?? jest.fn(),
    getWorldRoomName: overrides?.getWorldRoomName ?? jest.fn(),
    getSceneRoomName: overrides?.getSceneRoomName ?? jest.fn(),
    getOrCreateIngress: overrides?.getOrCreateIngress ?? jest.fn(),
    removeIngress: overrides?.removeIngress ?? jest.fn(),
    updateParticipantMetadata: overrides?.updateParticipantMetadata ?? jest.fn(),
    getRoom: overrides?.getRoom ?? jest.fn(),
    muteParticipant: overrides?.muteParticipant ?? jest.fn(),
    getWebhookEvent: overrides?.getWebhookEvent ?? jest.fn(),
    getRoomInfo: overrides?.getRoomInfo ?? jest.fn()
  }
}
