import { test } from '../../components'
import { makeRequest } from '../../utils'

test('Get Bulk Community Voice Chat Status Handler', ({ components, spyComponents }) => {
  const token = 'aToken'

  describe('when getting bulk community voice chat status', () => {
    it('should return status for multiple communities successfully', async () => {
      const communityIds = ['community-1', 'community-2', 'community-3']
      const mockStatuses = [
        {
          communityId: 'community-1',
          active: true,
          participantCount: 5,
          moderatorCount: 2
        },
        {
          communityId: 'community-2',
          active: false,
          participantCount: 0,
          moderatorCount: 0
        },
        {
          communityId: 'community-3',
          active: true,
          participantCount: 3,
          moderatorCount: 1
        }
      ]

      spyComponents.voice.getBulkCommunityVoiceChatStatus.mockResolvedValue(mockStatuses)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_ids: communityIds
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        data: [
          {
            community_id: 'community-1',
            active: true,
            participant_count: 5,
            moderator_count: 2
          },
          {
            community_id: 'community-2',
            active: false,
            participant_count: 0,
            moderator_count: 0
          },
          {
            community_id: 'community-3',
            active: true,
            participant_count: 3,
            moderator_count: 1
          }
        ]
      })
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).toHaveBeenCalledWith(communityIds)
    })

    it('should return empty array for empty community_ids', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_ids: []
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        data: []
      })
      // The handler returns early for empty arrays, so the voice component is not called
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).not.toHaveBeenCalled()
    })

    it('should return status for single community', async () => {
      const communityIds = ['single-community']
      const mockStatuses = [
        {
          communityId: 'single-community',
          active: true,
          participantCount: 2,
          moderatorCount: 1
        }
      ]

      spyComponents.voice.getBulkCommunityVoiceChatStatus.mockResolvedValue(mockStatuses)

      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_ids: communityIds
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        data: [
          {
            community_id: 'single-community',
            active: true,
            participant_count: 2,
            moderator_count: 1
          }
        ]
      })
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).toHaveBeenCalledWith(communityIds)
    })
  })

  describe('when handling invalid requests', () => {
    it('should return 400 when community_ids is not an array', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_ids: 'not-an-array'
        })
      })

      expect(response.status).toBe(400)
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).not.toHaveBeenCalled()
    })

    it('should return 400 when community_ids contains non-string values', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_ids: ['valid-id', 123, 'another-valid-id']
        })
      })

      expect(response.status).toBe(400)
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).not.toHaveBeenCalled()
    })

    it('should return 400 when community_ids contains empty strings', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_ids: ['valid-id', '', 'another-valid-id']
        })
      })

      expect(response.status).toBe(400)
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).not.toHaveBeenCalled()
    })

    it('should return 400 when community_ids contains whitespace-only strings', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_ids: ['valid-id', '   ', 'another-valid-id']
        })
      })

      expect(response.status).toBe(400)
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).not.toHaveBeenCalled()
    })

    it('should return 400 when request body is invalid JSON', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: 'invalid-json'
      })

      expect(response.status).toBe(400)
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).not.toHaveBeenCalled()
    })

    it('should return 400 when community_ids is missing', async () => {
      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(400)
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).not.toHaveBeenCalled()
    })
  })

  describe('when voice component throws an error', () => {
    it('should return 400 when voice component throws an error', async () => {
      const communityIds = ['community-1', 'community-2']
      spyComponents.voice.getBulkCommunityVoiceChatStatus.mockRejectedValue(new Error('Database error'))

      const response = await makeRequest(components.localFetch, `/community-voice-chat/status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          community_ids: communityIds
        })
      })

      expect(response.status).toBe(500)
      expect(spyComponents.voice.getBulkCommunityVoiceChatStatus).toHaveBeenCalledWith(communityIds)
    })
  })
})
