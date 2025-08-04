import { test } from '../../components'
import { makeRequest } from '../../utils'

test('End Community Voice Chat Handler', ({ components, spyComponents }) => {
  const communityId = 'test-community'
  const userAddress = '0x1234567890123456789012345678901234567890'
  const token = 'aToken'

  beforeEach(() => {
    // Mock successful voice component endCommunityVoiceChat method
    spyComponents.voice.endCommunityVoiceChat.mockResolvedValue(undefined)
  })

  describe('when ending a community voice chat', () => {
    it('should end community voice chat successfully', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          user_address: userAddress
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        message: 'Community voice chat ended successfully'
      })
      expect(spyComponents.voice.endCommunityVoiceChat).toHaveBeenCalledWith(communityId, userAddress.toLowerCase())
    })

    it('should return 405 when communityId is missing', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          user_address: userAddress
        })
      })

      expect(response.status).toBe(405)
    })

    it('should return 400 when user_address is missing', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      })

      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toMatchObject({
        error: 'The property user_address is required'
      })
    })

    it('should return 400 when body is invalid JSON', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: 'invalid json'
      })

      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toMatchObject({
        error: 'Invalid request body'
      })
    })

    it('should return 401 when no authorization header is provided', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_address: userAddress
        })
      })

      expect(response.status).toBe(401)
    })

    it('should return 500 when voice component throws an error', async () => {
      spyComponents.voice.endCommunityVoiceChat.mockRejectedValue(new Error('LiveKit error'))

      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          user_address: userAddress
        })
      })

      expect(response.status).toBe(500)
      expect(spyComponents.voice.endCommunityVoiceChat).toHaveBeenCalledWith(communityId, userAddress.toLowerCase())
    })
  })
})
