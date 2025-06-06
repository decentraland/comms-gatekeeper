import { IVoiceDBComponent } from '../src/adapters/db/types'

export const createMockedVoiceDBComponent = (
  overrides?: Partial<jest.Mocked<IVoiceDBComponent>>
): jest.Mocked<IVoiceDBComponent> => {
  return {
    getRoomUserIsIn: overrides?.getRoomUserIsIn ?? jest.fn(),
    joinUserToRoom: overrides?.joinUserToRoom ?? jest.fn(),
    removeUserFromRoom: overrides?.removeUserFromRoom ?? jest.fn(),
    disconnectUserFromRoom: overrides?.disconnectUserFromRoom ?? jest.fn(),
    isPrivateRoomActive: overrides?.isPrivateRoomActive ?? jest.fn(),
    createVoiceChatRoom: overrides?.createVoiceChatRoom ?? jest.fn(),
    deletePrivateVoiceChat: overrides?.deletePrivateVoiceChat ?? jest.fn()
  }
}
