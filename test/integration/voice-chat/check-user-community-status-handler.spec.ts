import { test } from '../../components'
import { makeRequest } from '../../utils'

test('Check User Community Status Handler', ({ components, spyComponents }) => {
  const userAddress = '0x1234567890123456789012345678901234567890'
  const token = 'aToken'

  beforeEach(() => {
    // Mock successful voice component methods
    spyComponents.voice.isUserInCommunityVoiceChat.mockResolvedValue(false)
  })

  describe('when checking user community voice chat status', () => {
    it('should return false when user is not in community voice chat', async () => {
      spyComponents.voice.isUserInCommunityVoiceChat.mockResolvedValue(false)

      const response = await makeRequest(components.localFetch, `/users/${userAddress}/community-voice-chat-status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        userAddress: userAddress.toLowerCase(),
        isInCommunityVoiceChat: false
      })
      expect(spyComponents.voice.isUserInCommunityVoiceChat).toHaveBeenCalledWith(userAddress.toLowerCase())
    })

    it('should return true when user is in community voice chat', async () => {
      spyComponents.voice.isUserInCommunityVoiceChat.mockResolvedValue(true)

      const response = await makeRequest(components.localFetch, `/users/${userAddress}/community-voice-chat-status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        userAddress: userAddress.toLowerCase(),
        isInCommunityVoiceChat: true
      })
      expect(spyComponents.voice.isUserInCommunityVoiceChat).toHaveBeenCalledWith(userAddress.toLowerCase())
    })

    it('should return 400 when userAddress is missing', async () => {
      const response = await makeRequest(components.localFetch, `/users//community-voice-chat-status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      expect(response.status).toBe(404)
    })

    it('should return 500 when voice component throws an error', async () => {
      spyComponents.voice.isUserInCommunityVoiceChat.mockRejectedValue(new Error('Database error'))

      const response = await makeRequest(components.localFetch, `/users/${userAddress}/community-voice-chat-status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      expect(response.status).toBe(500)
      expect(spyComponents.voice.isUserInCommunityVoiceChat).toHaveBeenCalledWith(userAddress.toLowerCase())
    })

    it('should return 401 when authorization header is missing', async () => {
      const response = await makeRequest(components.localFetch, `/users/${userAddress}/community-voice-chat-status`, {
        method: 'GET'
      })

      expect(response.status).toBe(401)
      expect(spyComponents.voice.isUserInCommunityVoiceChat).not.toHaveBeenCalled()
    })
  })
})
