import { test } from '../../components'
import { makeRequest } from '../../utils'

test('Check User Community Status Handler', ({ components, spyComponents }) => {
  const userAddress = '0x1234567890123456789012345678901234567890'
  const token = 'aToken'

  describe('when checking user community voice chat status', () => {
    describe('and user is not in community voice chat', () => {
      beforeEach(() => {
        spyComponents.voice.isUserInCommunityVoiceChat.mockResolvedValue(false)
      })

      it('should return false', async () => {
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
    })

    describe('and user is in community voice chat', () => {
      beforeEach(() => {
        spyComponents.voice.isUserInCommunityVoiceChat.mockResolvedValue(true)
      })

      it('should return true', async () => {
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
    })

    describe('and userAddress is missing', () => {
      it('should return 404', async () => {
        const response = await makeRequest(components.localFetch, `/users//community-voice-chat-status`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.status).toBe(404)
      })
    })

    describe('and voice component throws an error', () => {
      beforeEach(() => {
        spyComponents.voice.isUserInCommunityVoiceChat.mockRejectedValue(new Error('Database error'))
      })

      it('should return 500', async () => {
        const response = await makeRequest(components.localFetch, `/users/${userAddress}/community-voice-chat-status`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.status).toBe(500)
        expect(spyComponents.voice.isUserInCommunityVoiceChat).toHaveBeenCalledWith(userAddress.toLowerCase())
      })
    })

    describe('and authorization header is missing', () => {
      it('should return 401', async () => {
        const response = await makeRequest(components.localFetch, `/users/${userAddress}/community-voice-chat-status`, {
          method: 'GET'
        })

        expect(response.status).toBe(401)
        expect(spyComponents.voice.isUserInCommunityVoiceChat).not.toHaveBeenCalled()
      })
    })
  })
})
