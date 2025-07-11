import { IVoiceDBComponent } from '../../src/adapters/db/types'

export const createVoiceDBMockedComponent = (
  overrides?: Partial<jest.Mocked<IVoiceDBComponent>>
): jest.Mocked<IVoiceDBComponent> => {
  return {
    // Private voice chat methods
    getUsersInRoom: overrides?.getUsersInRoom ?? jest.fn(),
    getRoomUserIsIn: overrides?.getRoomUserIsIn ?? jest.fn(),
    joinUserToRoom: overrides?.joinUserToRoom ?? jest.fn(),
    updateUserStatusAsDisconnected: overrides?.updateUserStatusAsDisconnected ?? jest.fn(),
    updateUserStatusAsConnectionInterrupted: overrides?.updateUserStatusAsConnectionInterrupted ?? jest.fn(),
    isPrivateRoomActive: overrides?.isPrivateRoomActive ?? jest.fn(),
    createVoiceChatRoom: overrides?.createVoiceChatRoom ?? jest.fn(),
    deletePrivateVoiceChat: overrides?.deletePrivateVoiceChat ?? jest.fn(),
    deleteExpiredPrivateVoiceChats: overrides?.deleteExpiredPrivateVoiceChats ?? jest.fn(),

    // Community voice chat methods
    createCommunityVoiceChatRoom: overrides?.createCommunityVoiceChatRoom ?? jest.fn(),
    joinUserToCommunityRoom: overrides?.joinUserToCommunityRoom ?? jest.fn(),
    updateCommunityUserStatus: overrides?.updateCommunityUserStatus ?? jest.fn(),
    getCommunityUsersInRoom: overrides?.getCommunityUsersInRoom ?? jest.fn(),
    shouldDestroyCommunityRoom: overrides?.shouldDestroyCommunityRoom ?? jest.fn(),
    deleteCommunityVoiceChat: overrides?.deleteCommunityVoiceChat ?? jest.fn(),
    deleteExpiredCommunityVoiceChats: overrides?.deleteExpiredCommunityVoiceChats ?? jest.fn()
  }
}
