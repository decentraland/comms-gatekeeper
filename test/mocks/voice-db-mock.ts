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
    deleteExpiredPrivateVoiceChats: overrides?.deleteExpiredPrivateVoiceChats ?? jest.fn(),
    deletePrivateVoiceChatUserIsOrWasIn: overrides?.deletePrivateVoiceChatUserIsOrWasIn ?? jest.fn(),

    // Community voice chat methods
    joinUserToCommunityRoom: overrides?.joinUserToCommunityRoom ?? jest.fn(),
    updateCommunityUserStatus: overrides?.updateCommunityUserStatus ?? jest.fn(),
    getCommunityUsersInRoom: overrides?.getCommunityUsersInRoom ?? jest.fn(),
    isCommunityRoomActive: overrides?.isCommunityRoomActive ?? jest.fn(),

    deleteCommunityVoiceChat: overrides?.deleteCommunityVoiceChat ?? jest.fn(),
    deleteExpiredCommunityVoiceChats: overrides?.deleteExpiredCommunityVoiceChats ?? jest.fn(),
    isActiveCommunityUser: overrides?.isActiveCommunityUser ?? jest.fn(),
    getAllActiveCommunityVoiceChats: overrides?.getAllActiveCommunityVoiceChats ?? jest.fn(),
    isUserInAnyCommunityVoiceChat: overrides?.isUserInAnyCommunityVoiceChat ?? jest.fn(),
    getBulkCommunityVoiceChatStatus: overrides?.getBulkCommunityVoiceChatStatus ?? jest.fn()
  }
}
