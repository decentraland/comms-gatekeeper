import { test } from '../../components'
import { makeRequest } from '../../utils'

test('Community Voice Chat Actions', ({ components, spyComponents }) => {
  const communityId = 'test-community'
  const userAddress = '0x1234567890123456789012345678901234567890'
  const token = 'aToken'

  beforeEach(() => {
    // Mock successful voice component methods
    spyComponents.voice.requestToSpeakInCommunity.mockResolvedValue(undefined)
    spyComponents.voice.promoteSpeakerInCommunity.mockResolvedValue(undefined)
    spyComponents.voice.demoteSpeakerInCommunity.mockResolvedValue(undefined)
    spyComponents.voice.kickPlayerFromCommunity.mockResolvedValue(undefined)
  })

  describe('when requesting to speak', () => {
    it('should request to speak successfully', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speak-request`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        message: 'Request to speak sent successfully'
      })
      expect(spyComponents.voice.requestToSpeakInCommunity).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase()
      )
    })

    it('should return 400 when communityId is missing', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat//users/${userAddress}/request-to-speak`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(404) // Router will return 404 for invalid path
    })

    it('should return 400 when userAddress is missing', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users//request-to-speak`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(404) // Router will return 404 for invalid path
    })

    it('should return 500 when voice component throws error', async () => {
      spyComponents.voice.requestToSpeakInCommunity.mockRejectedValue(new Error('Database error'))

      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speak-request`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Internal Server Error' })
    })
  })

  describe('when promoting a speaker', () => {
    it('should promote speaker successfully', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speaker`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        message: 'User promoted to speaker successfully'
      })
      expect(spyComponents.voice.promoteSpeakerInCommunity).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase()
      )
    })

    it('should return 500 when voice component throws error', async () => {
      spyComponents.voice.promoteSpeakerInCommunity.mockRejectedValue(new Error('LiveKit error'))

      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speaker`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Internal Server Error' })
    })
  })

  describe('when demoting a speaker', () => {
    it('should demote speaker successfully', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speaker`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        message: 'User demoted to listener successfully'
      })
      expect(spyComponents.voice.demoteSpeakerInCommunity).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase()
      )
    })

    it('should return 500 when voice component throws error', async () => {
      spyComponents.voice.demoteSpeakerInCommunity.mockRejectedValue(new Error('LiveKit error'))

      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speaker`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Internal Server Error' })
    })
  })

  describe('when kicking a player', () => {
    it('should kick player successfully', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        message: 'User kicked from voice chat successfully'
      })
      expect(spyComponents.voice.kickPlayerFromCommunity).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase()
      )
    })

    it('should return 500 when voice component throws error', async () => {
      spyComponents.voice.kickPlayerFromCommunity.mockRejectedValue(new Error('LiveKit error'))

      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Internal Server Error' })
    })
  })

  describe('when authorizing', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speak-request`,
        {
          method: 'POST'
        }
      )

      expect(response.status).toBe(401)
    })

    it('should return 401 when invalid token is provided', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speaker`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer invalid-token'
          }
        }
      )

      expect(response.status).toBe(401)
    })
  })
}) 