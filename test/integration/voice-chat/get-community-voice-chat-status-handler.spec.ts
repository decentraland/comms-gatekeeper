import { test } from '../../components'
import { makeRequest } from '../../utils'

test('Get Community Voice Chat Status Handler', ({ components, spyComponents }) => {
  const communityId = 'test-community'
  const token = 'aToken'

  describe('when getting community voice chat status', () => {
    it('should return active status successfully', async () => {
      const mockStatus = {
        active: true,
        participantCount: 5,
        moderatorCount: 2
      }

      spyComponents.voice.getCommunityVoiceChatStatus.mockResolvedValue(mockStatus)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        active: true,
        participant_count: 5,
        moderator_count: 2
      })
      expect(spyComponents.voice.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
    })

    it('should return inactive status successfully', async () => {
      const mockStatus = {
        active: false,
        participantCount: 0,
        moderatorCount: 0
      }

      spyComponents.voice.getCommunityVoiceChatStatus.mockResolvedValue(mockStatus)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        active: false,
        participant_count: 0,
        moderator_count: 0
      })
      expect(spyComponents.voice.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
    })

    it('should return status with zero participants but active moderators', async () => {
      const mockStatus = {
        active: true,
        participantCount: 0,
        moderatorCount: 1
      }

      spyComponents.voice.getCommunityVoiceChatStatus.mockResolvedValue(mockStatus)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        active: true,
        participant_count: 0,
        moderator_count: 1
      })
      expect(spyComponents.voice.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
    })
  })

  describe('when handling invalid requests', () => {
    it('should return 400 when communityId is missing', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat//status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      expect(response.status).toBe(404) // This will be a 404 because the route doesn't match
      expect(spyComponents.voice.getCommunityVoiceChatStatus).not.toHaveBeenCalled()
    })

    it('should return 400 when communityId is empty', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/ /status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      expect(response.status).toBe(400)
      expect(spyComponents.voice.getCommunityVoiceChatStatus).not.toHaveBeenCalled()
    })
  })

  describe('when voice component throws an error', () => {
    it('should return 404 when voice component throws not found error', async () => {
      const notFoundError = new Error('Community voice chat not found for community test-community')
      notFoundError.message = 'not found'
      spyComponents.voice.getCommunityVoiceChatStatus.mockRejectedValue(notFoundError)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      expect(response.status).toBe(404)
      expect(spyComponents.voice.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
    })

    it('should return 404 when voice component throws 404 error', async () => {
      const notFoundError = new Error('404 error')
      notFoundError.message = '404'
      spyComponents.voice.getCommunityVoiceChatStatus.mockRejectedValue(notFoundError)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      expect(response.status).toBe(404)
      expect(spyComponents.voice.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
    })

    it('should return 500 when voice component throws other error', async () => {
      const otherError = new Error('Database connection failed')
      spyComponents.voice.getCommunityVoiceChatStatus.mockRejectedValue(otherError)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/${communityId}/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      expect(response.status).toBe(500)
      expect(spyComponents.voice.getCommunityVoiceChatStatus).toHaveBeenCalledWith(communityId)
    })
  })

  describe('when handling different community IDs', () => {
    it('should handle community ID with special characters', async () => {
      const specialCommunityId = 'community-with-special-chars_123'
      const mockStatus = {
        active: true,
        participantCount: 3,
        moderatorCount: 1
      }

      spyComponents.voice.getCommunityVoiceChatStatus.mockResolvedValue(mockStatus)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/${specialCommunityId}/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        active: true,
        participant_count: 3,
        moderator_count: 1
      })
      expect(spyComponents.voice.getCommunityVoiceChatStatus).toHaveBeenCalledWith(specialCommunityId)
    })

    it('should handle numeric community ID', async () => {
      const numericCommunityId = '12345'
      const mockStatus = {
        active: false,
        participantCount: 0,
        moderatorCount: 0
      }

      spyComponents.voice.getCommunityVoiceChatStatus.mockResolvedValue(mockStatus)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/${numericCommunityId}/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        active: false,
        participant_count: 0,
        moderator_count: 0
      })
      expect(spyComponents.voice.getCommunityVoiceChatStatus).toHaveBeenCalledWith(numericCommunityId)
    })
  })
})
