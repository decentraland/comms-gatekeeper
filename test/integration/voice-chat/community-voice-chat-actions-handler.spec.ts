import { CommunityVoiceChatAction } from '../../../src/types/community-voice'
import { CommunityRole } from '../../../src/types/social.type'
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
    spyComponents.voice.getCommunityVoiceChatCredentialsWithRole.mockResolvedValue({
      connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
    })
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
      expect(spyComponents.voice.requestToSpeakInCommunity).toHaveBeenCalledWith(communityId, userAddress.toLowerCase())
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
      expect(spyComponents.voice.promoteSpeakerInCommunity).toHaveBeenCalledWith(communityId, userAddress.toLowerCase())
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
      expect(spyComponents.voice.demoteSpeakerInCommunity).toHaveBeenCalledWith(communityId, userAddress.toLowerCase())
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
      expect(spyComponents.voice.kickPlayerFromCommunity).toHaveBeenCalledWith(communityId, userAddress.toLowerCase())
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

  describe('when creating community voice chat with user roles', () => {
    beforeEach(() => {
      // Mock the new function with role parameter
      spyComponents.voice.getCommunityVoiceChatCredentialsWithRole.mockResolvedValue({
        connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
    })

    it('should create voice chat for owner with profile data', async () => {
      const profileData = {
        name: 'TestOwner',
        has_claimed_name: true,
        profile_picture_url: 'https://example.com/owner-avatar.png'
      }

      const requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: 'create',
        user_role: 'owner',
        profile_data: profileData
      }

      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        'owner',
        {
          name: 'TestOwner',
          has_claimed_name: true,
          profile_picture_url: 'https://example.com/owner-avatar.png'
        },
        CommunityVoiceChatAction.CREATE
      )
    })

    it('should create voice chat for moderator with profile data', async () => {
      const profileData = {
        name: 'TestModerator',
        has_claimed_name: true,
        profile_picture_url: 'https://example.com/moderator-avatar.png'
      }

      const requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.CREATE,
        user_role: CommunityRole.Moderator,
        profile_data: profileData
      }

      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        'moderator',
        {
          name: 'TestModerator',
          has_claimed_name: true,
          profile_picture_url: 'https://example.com/moderator-avatar.png'
        },
        CommunityVoiceChatAction.CREATE
      )
    })

    it('should join voice chat for member with profile data', async () => {
      const profileData = {
        name: 'TestMember',
        has_claimed_name: false,
        profile_picture_url: 'https://example.com/member-avatar.png'
      }

      const requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.JOIN,
        user_role: CommunityRole.Member,
        profile_data: profileData
      }

      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        'member',
        {
          name: 'TestMember',
          has_claimed_name: false,
          profile_picture_url: 'https://example.com/member-avatar.png'
        }
      )
    })

    it('should join voice chat for none role with profile data', async () => {
      const profileData = {
        name: 'TestUser',
        has_claimed_name: false,
        profile_picture_url: 'https://example.com/user-avatar.png'
      }

      const requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.JOIN,
        user_role: CommunityRole.None,
        profile_data: profileData
      }

      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        'none',
        {
          name: 'TestUser',
          has_claimed_name: false,
          profile_picture_url: 'https://example.com/user-avatar.png'
        },
        CommunityVoiceChatAction.JOIN
      )
    })

    it('should default to member role when no role is provided', async () => {
      const requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.CREATE
      }

      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        CommunityRole.Member, // Should default to member
        undefined,
        CommunityVoiceChatAction.CREATE
      )
    })

    it('should work without profile data but with role', async () => {
      const requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.CREATE,
        user_role: CommunityRole.Owner
      }

      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        'owner',
        undefined,
        CommunityVoiceChatAction.CREATE
      )
    })
  })
})
