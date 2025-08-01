import { test } from '../../components'
import { makeRequest } from '../../utils'
import { VoiceChatUserStatus } from '../../../src/adapters/db/types'

test('GET /community-voice-chats/active', ({ components, spyComponents }) => {
  let token: string
  const communityId1 = 'test-1'
  const communityId2 = 'test-2'
  const roomName1 = `community-${communityId1}`
  const roomName2 = `community-${communityId2}`
  const moderatorAddress = '0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd'
  const userAddress = '0x1234567890123456789012345678901234567890'

  describe('when the authorization token is invalid', () => {
    beforeEach(() => {
      token = 'an-invalid-token'
    })

    it('should respond with a 401 and a message saying that the token is invalid', async () => {
      const response = await makeRequest(components.localFetch, '/community-voice-chat/active', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      expect(response.status).toBe(401)
      expect(response.json()).resolves.toEqual({ error: 'Invalid authorization header' })
    })
  })

  describe('when the authorization token is valid', () => {
    beforeEach(() => {
      token = 'aToken'
    })

    describe('and there are no active community voice chats', () => {
      it('should respond with a 200 and an empty array', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat/active', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          data: [],
          total: 0
        })
      })
    })

    describe('and there are active community voice chats', () => {
      beforeEach(async () => {
        // Create community voice chat rooms with active moderators
        await components.voiceDB.joinUserToCommunityRoom(moderatorAddress, roomName1, true) // moderator
        await components.voiceDB.joinUserToCommunityRoom(userAddress, roomName1, false) // regular user
        await components.voiceDB.joinUserToCommunityRoom(moderatorAddress, roomName2, true) // moderator only

        await components.voiceDB.updateCommunityUserStatus(moderatorAddress, roomName1, VoiceChatUserStatus.Connected)
        await components.voiceDB.updateCommunityUserStatus(userAddress, roomName1, VoiceChatUserStatus.Connected)
        await components.voiceDB.updateCommunityUserStatus(moderatorAddress, roomName2, VoiceChatUserStatus.Connected)
      })

      afterEach(async () => {
        await components.voiceDB.deleteCommunityVoiceChat(roomName1)
        await components.voiceDB.deleteCommunityVoiceChat(roomName2)
      })

      it('should respond with a 200 and return active community voice chats', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat/active', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.status).toBe(200)
        const body = await response.json()

        expect(body.total).toBe(2)
        expect(body.data).toHaveLength(2)

        // Verify the structure of returned data
        const community1Chat = body.data.find((chat: any) => chat.communityId === communityId1)
        const community2Chat = body.data.find((chat: any) => chat.communityId === communityId2)

        expect(community1Chat).toEqual({
          communityId: communityId1,
          participantCount: 2, // moderator + regular user
          moderatorCount: 1
        })

        expect(community2Chat).toEqual({
          communityId: communityId2,
          participantCount: 1, // moderator only
          moderatorCount: 1
        })
      })
    })

    describe('and there are community voice chats but no active moderators', () => {
      beforeEach(async () => {
        // Create community voice chat rooms with only regular users (no moderators)
        await components.voiceDB.joinUserToCommunityRoom(userAddress, roomName1, false) // regular user only
        // Simulate connected user to ensure they're considered "active"
        await components.voiceDB.updateCommunityUserStatus(userAddress, roomName1, VoiceChatUserStatus.Connected)
      })

      afterEach(async () => {
        await components.voiceDB.deleteCommunityVoiceChat(roomName1)
      })

      it('should respond with a 200 and return empty array since rooms without moderators are not active', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat/active', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.status).toBe(200)
        const body = await response.json()

        expect(body).toEqual({
          data: [],
          total: 0
        })
      })
    })

    describe('when there is an error in the voice component', () => {
      beforeEach(() => {
        // Mock an error in the voice component
        spyComponents.voice.getAllActiveCommunityVoiceChats.mockRejectedValue(new Error('Database error'))
      })

      afterEach(() => {
        spyComponents.voice.getAllActiveCommunityVoiceChats.mockRestore()
      })

      it('should respond with a 500 and an error message', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat/active', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body).toEqual({
          error: 'Failed to get active community voice chats',
          message: 'Database error'
        })
      })
    })
  })
})
