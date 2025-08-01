import { IVoiceComponent } from '../../src/logic/voice/types'

export const createVoiceMockedComponent = (
  overrides?: Partial<jest.Mocked<IVoiceComponent>>
): jest.Mocked<IVoiceComponent> => {
  return {
    isUserInVoiceChat: jest.fn(),
    handleParticipantJoined: jest.fn(),
    handleParticipantLeft: jest.fn(),
    getPrivateVoiceChatRoomCredentials: jest.fn(),
    endPrivateVoiceChat: jest.fn(),
    expirePrivateVoiceChats: jest.fn(),
    getCommunityVoiceChatCredentialsWithRole: jest.fn(),
    expireCommunityVoiceChats: jest.fn(),
    getCommunityVoiceChatStatus: jest.fn(),
    requestToSpeakInCommunity: jest.fn(),
    promoteSpeakerInCommunity: jest.fn(),
    demoteSpeakerInCommunity: jest.fn(),
    kickPlayerFromCommunity: jest.fn(),
    getAllActiveCommunityVoiceChats: jest.fn(),
    ...overrides
  }
}
