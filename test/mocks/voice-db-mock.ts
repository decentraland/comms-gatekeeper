import { IVoiceDBComponent } from '../../src/adapters/db/types'

export const createVoiceDBMockedComponent = (
  overrides?: Partial<jest.Mocked<IVoiceDBComponent>>
): jest.Mocked<IVoiceDBComponent> => {
  return {
    getUsersInRoom: overrides?.getUsersInRoom ?? jest.fn(),
    getRoomUserIsIn: overrides?.getRoomUserIsIn ?? jest.fn(),
    joinUserToRoom: overrides?.joinUserToRoom ?? jest.fn(),
    updateUserStatusAsDisconnected: overrides?.updateUserStatusAsDisconnected ?? jest.fn(),
    updateUserStatusAsConnectionInterrupted: overrides?.updateUserStatusAsConnectionInterrupted ?? jest.fn(),
    isPrivateRoomActive: overrides?.isPrivateRoomActive ?? jest.fn(),
    createVoiceChatRoom: overrides?.createVoiceChatRoom ?? jest.fn(),
    deletePrivateVoiceChat: overrides?.deletePrivateVoiceChat ?? jest.fn(),
    deleteExpiredPrivateVoiceChats: overrides?.deleteExpiredPrivateVoiceChats ?? jest.fn()
  }
}
