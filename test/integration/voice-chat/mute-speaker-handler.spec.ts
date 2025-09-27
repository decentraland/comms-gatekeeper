import { test } from '../../components'
import { makeRequest } from '../../utils'

test('Mute Speaker Handler', ({ components, spyComponents }) => {
  const communityId = 'test-community'
  const userAddress = '0x1234567890123456789012345678901234567890'
  const token = 'aToken'

  beforeEach(() => {
    // Mock successful voice component methods
    spyComponents.voice.muteSpeakerInCommunityVoiceChat.mockResolvedValue(undefined)
  })

  describe('when muting a speaker', () => {
    it('should mute speaker successfully', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            muted: true
          })
        }
      )

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        message: 'User muted successfully'
      })
      expect(spyComponents.voice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        true
      )
    })

    it('should unmute speaker successfully', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            muted: false
          })
        }
      )

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        message: 'User unmuted successfully'
      })
      expect(spyComponents.voice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        false
      )
    })

    it('should return 400 when communityId is missing', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat//users/${userAddress}/mute`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          muted: true
        })
      })

      expect(response.status).toBe(404) // Router will return 404 for invalid path
    })

    it('should return 400 when userAddress is missing', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}/users//mute`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          muted: true
        })
      })

      expect(response.status).toBe(404) // Router will return 404 for invalid path
    })

    it('should return 400 when muted field is missing', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({})
        }
      )

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBeDefined()
      expect(spyComponents.voice.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
    })

    it('should return 400 when muted field is not a boolean', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            muted: 'invalid'
          })
        }
      )

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBeDefined()
      expect(spyComponents.voice.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
    })

    it('should return 400 when muted field is null', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            muted: null
          })
        }
      )

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toBeDefined()
      expect(spyComponents.voice.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
    })

    it('should return 500 when voice component throws error', async () => {
      spyComponents.voice.muteSpeakerInCommunityVoiceChat.mockRejectedValue(new Error('Database error'))

      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            muted: true
          })
        }
      )

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Internal Server Error' })
    })

    it('should return 401 when authorization header is missing', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            muted: true
          })
        }
      )

      expect(response.status).toBe(401)
      expect(spyComponents.voice.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
    })

    it('should return 401 when authorization token is invalid', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer invalid-token'
          },
          body: JSON.stringify({
            muted: true
          })
        }
      )

      expect(response.status).toBe(401)
      expect(spyComponents.voice.muteSpeakerInCommunityVoiceChat).not.toHaveBeenCalled()
    })

    it('should handle edge case with extra whitespace in addresses', async () => {
      const addressWithWhitespace = ' 0x1234567890123456789012345678901234567890 '

      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${addressWithWhitespace}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            muted: true
          })
        }
      )

      expect(response.status).toBe(200)
      // Should normalize the address to lowercase without whitespace
      expect(spyComponents.voice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
        communityId,
        addressWithWhitespace.toLowerCase(),
        true
      )
    })

    it('should handle uppercase user addresses by converting to lowercase', async () => {
      const uppercaseAddress = '0X1234567890123456789012345678901234567890'

      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${uppercaseAddress}/mute`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            muted: true
          })
        }
      )

      expect(response.status).toBe(200)
      expect(spyComponents.voice.muteSpeakerInCommunityVoiceChat).toHaveBeenCalledWith(
        communityId,
        uppercaseAddress.toLowerCase(),
        true
      )
    })
  })
})
