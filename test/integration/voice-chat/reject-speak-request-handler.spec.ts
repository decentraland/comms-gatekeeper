import { test } from '../../components'
import { makeRequest } from '../../utils'

test('Reject Speak Request Handler', ({ components, spyComponents }) => {
  const communityId = 'test-community'
  const userAddress = '0x1234567890123456789012345678901234567890'
  const token = 'aToken'

  beforeEach(() => {
    // Mock successful voice component methods
    spyComponents.voice.rejectSpeakRequestInCommunity.mockResolvedValue(undefined)
  })

  describe('when rejecting speak request', () => {
    it('should reject speak request successfully', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speak-request`,
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
        message: 'Speak request rejected successfully'
      })
      expect(spyComponents.voice.rejectSpeakRequestInCommunity).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase()
      )
    })

    it('should return 400 when communityId is missing', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat//users/${userAddress}/speak-request`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(404)
    })

    it('should return 400 when userAddress is missing', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users//speak-request`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(404)
    })

    it('should return 500 when voice component throws an error', async () => {
      spyComponents.voice.rejectSpeakRequestInCommunity.mockRejectedValue(new Error('Database error'))

      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speak-request`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      expect(response.status).toBe(500)
      expect(spyComponents.voice.rejectSpeakRequestInCommunity).toHaveBeenCalledWith(
        communityId,
        userAddress.toLowerCase()
      )
    })

    it('should return 401 when authorization header is missing', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/community-voice-chat/${communityId}/users/${userAddress}/speak-request`,
        {
          method: 'DELETE'
        }
      )

      expect(response.status).toBe(401)
      expect(spyComponents.voice.rejectSpeakRequestInCommunity).not.toHaveBeenCalled()
    })
  })
})
