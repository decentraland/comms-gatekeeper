import { getCommunityVoiceChatRoomName, getCommunityIdFromRoomName } from '../../src/logic/voice/utils'

describe('Voice Utils', () => {
  describe('when getting the community voice chat room name', () => {
    it('should generate the correct room name for the community voice chat', () => {
      const validCommunityId = 'test-community-123'
      const roomName = getCommunityVoiceChatRoomName(validCommunityId)
      expect(roomName).toBe(`voice-chat-community-${validCommunityId}`)
    })
  })

  describe('when getting the community id from the room name', () => {
    it('should extract the community id from the room name', () => {
      const roomName = 'voice-chat-community-test-community-123'
      const communityId = getCommunityIdFromRoomName(roomName)
      expect(communityId).toBe('test-community-123')
    })
  })
}) 