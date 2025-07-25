import { test } from '../../components'
import { makeRequest } from '../../utils'
import { CommunityRole } from '../../../src/types/social.type'
import { CommunityVoiceChatAction } from '../../../src/types/community-voice'

test('Community Voice Chat Handler', ({ components, spyComponents }) => {
  const communityId = 'test-community'
  const userAddress = '0x1234567890123456789012345678901234567890'
  const token = 'aToken'

  beforeEach(() => {
    // Mock successful voice component method
    spyComponents.voice.getCommunityVoiceChatCredentialsWithRole.mockResolvedValue({
      connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
    })
  })

  describe('when creating a community voice chat', () => {
    it('should create successfully with valid role', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_id: communityId,
          user_address: userAddress,
          action: CommunityVoiceChatAction.CREATE,
          user_role: CommunityRole.Owner,
          profile_data: {
            name: 'Test User',
            hasClaimedName: true,
            profilePictureUrl: 'https://example.com/pic.jpg'
          }
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        CommunityRole.Owner,
        {
          name: 'Test User',
          hasClaimedName: true,
          profilePictureUrl: 'https://example.com/pic.jpg'
        },
        CommunityVoiceChatAction.CREATE
      )
    })

    it('should create successfully without profile data', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_id: communityId,
          user_address: userAddress,
          action: CommunityVoiceChatAction.CREATE,
          user_role: CommunityRole.Moderator
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        CommunityRole.Moderator,
        undefined,
        CommunityVoiceChatAction.CREATE
      )
    })

    it('should default to none role when role not provided', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_id: communityId,
          user_address: userAddress,
          action: CommunityVoiceChatAction.CREATE
        })
      })

      expect(response.status).toBe(200)
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        CommunityRole.None,
        undefined
      )
    })
  })

  describe('when joining a community voice chat', () => {
    it('should join successfully with valid role', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_id: communityId,
          user_address: userAddress,
          action: CommunityVoiceChatAction.JOIN,
          user_role: CommunityRole.Member,
          profile_data: {
            name: 'Joining User',
            hasClaimedName: false,
            profilePictureUrl: 'https://example.com/join-pic.jpg'
          }
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        connection_url: 'livekit:wss://voice.livekit.cloud?access_token=test-token'
      })
      expect(spyComponents.voice.getCommunityVoiceChatCredentialsWithRole).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase(),
        CommunityRole.Member,
        {
          name: 'Joining User',
          hasClaimedName: false,
          profilePictureUrl: 'https://example.com/join-pic.jpg'
        }
      )
    })
  })

  describe('validation errors', () => {
    it('should return 400 when community_id is missing', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_address: userAddress,
          action: CommunityVoiceChatAction.CREATE
        })
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('community_id is required')
    })

    it('should return 400 when user_address is missing', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_id: communityId,
          action: CommunityVoiceChatAction.CREATE
        })
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('user_address is required')
    })

    it('should return 400 when action is missing', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_id: communityId,
          user_address: userAddress
        })
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('action is required')
    })

    it('should return 400 when action is invalid', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_id: communityId,
          user_address: userAddress,
          action: 'invalid_action'
        })
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('action is required and must be one of: create, join')
    })

    it('should return 400 when user_role is invalid', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_id: communityId,
          user_address: userAddress,
          action: CommunityVoiceChatAction.CREATE,
          user_role: 'invalid_role'
        })
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid user_role. Must be one of: owner, moderator, member, none')
    })

    it('should return 400 when request body is invalid JSON', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      })

      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Invalid request body')
    })
  })
})
