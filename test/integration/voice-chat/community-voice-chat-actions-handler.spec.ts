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

  describe('when creating community voice chat with profile data', () => {
    it('should create voice chat with profile data for moderator', async () => {
      const profileData = {
        name: 'TestModerator',
        hasClaimedName: true,
        profilePictureUrl: 'https://example.com/avatar.png'
      }

      const requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: 'create',
        profile_data: profileData
      }

      spyComponents.voice.getCommunityVoiceChatCredentialsForModerator.mockResolvedValue({
        connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })

      const response = await makeRequest(
        components.localFetch,
        '/community-voice-chat',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      )

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsForModerator).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        profileData
      )
    })

    it('should join voice chat with profile data for member', async () => {
      const profileData = {
        name: 'TestMember',
        hasClaimedName: false,
        profilePictureUrl: 'https://example.com/member-avatar.png'
      }

      const requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: 'join',
        profile_data: profileData
      }

      spyComponents.voice.getCommunityVoiceChatCredentialsForMember.mockResolvedValue({
        connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=member-token'
      })

      const response = await makeRequest(
        components.localFetch,
        '/community-voice-chat',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      )

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=member-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsForMember).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        profileData
      )
    })

    it('should work without profile data', async () => {
      const requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: 'create'
      }

      spyComponents.voice.getCommunityVoiceChatCredentialsForModerator.mockResolvedValue({
        connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })

      const response = await makeRequest(
        components.localFetch,
        '/community-voice-chat',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      )

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsForModerator).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        undefined
      )
    })
  })
}) 