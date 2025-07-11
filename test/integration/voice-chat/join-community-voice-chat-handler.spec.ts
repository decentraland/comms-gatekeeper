import { test } from '../../components'
import { makeRequest } from '../../utils'

test('POST /community-voice-chat/join', ({ components, spyComponents }) => {
  let token: string
  let requestBody: { community_id: string; member_address: string }
  const validMemberAddress = '0x742d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0'
  const validCommunityId = 'test-community-123'

  describe('when no authorization header is provided', () => {
    beforeEach(() => {
      requestBody = {
        community_id: validCommunityId,
        member_address: validMemberAddress
      }
    })

    it('should respond with a 401 and a message saying access is forbidden', async () => {
      const response = await makeRequest(components.localFetch, '/community-voice-chat/join', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body).toEqual({ error: 'Authorization header is missing' })
    })
  })

  describe('when the authorization token is invalid', () => {
    beforeEach(() => {
      token = 'an-invalid-token'
      requestBody = {
        community_id: validCommunityId,
        member_address: validMemberAddress
      }
    })

    it('should respond with a 401 and a message saying that the token is invalid', async () => {
      const response = await makeRequest(components.localFetch, '/community-voice-chat/join', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      })
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body).toEqual({ error: 'Invalid authorization header' })
    })
  })

  describe('when the authorization token is valid', () => {
    beforeEach(() => {
      token = 'aToken'
    })

    describe('when the request body is an invalid JSON', () => {
      beforeEach(() => {
        requestBody = 'invalid-json' as any
      })

      it('should respond with a 400 and a message saying that the request body is invalid', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat/join', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: 'invalid-json'
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'Invalid request body - must be valid JSON' })
      })
    })

    describe('when community_id is missing', () => {
      beforeEach(() => {
        requestBody = {
          member_address: validMemberAddress
        } as any
      })

      it('should respond with a 400 and a message saying that community_id is required', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat/join', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'The property community_id is required' })
      })
    })

    describe('when member_address is missing', () => {
      beforeEach(() => {
        requestBody = {
          community_id: validCommunityId
        } as any
      })

      it('should respond with a 400 and a message saying that member_address is required', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat/join', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'The property member_address is required' })
      })
    })

    describe('when the request is valid', () => {
      beforeEach(() => {
        requestBody = {
          community_id: validCommunityId,
          member_address: validMemberAddress
        }
      })

      describe('and getting community voice chat credentials for member fails', () => {
        beforeEach(() => {
          spyComponents.voice.getCommunityVoiceChatCredentialsForMember.mockRejectedValueOnce(
            new Error('Failed to get community voice chat credentials')
          )
        })

        it('should respond with a 500', async () => {
          const response = await makeRequest(components.localFetch, '/community-voice-chat/join', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
          })
          const body = await response.json()

          expect(response.status).toBe(500)
          expect(body).toEqual({ error: 'Internal Server Error' })
        })
      })

      describe('and getting community voice chat credentials for member succeeds', () => {
        beforeEach(() => {
          spyComponents.voice.getCommunityVoiceChatCredentialsForMember.mockResolvedValueOnce({
            connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=member-token'
          })
        })

        it('should respond with a 200 and the community voice chat credentials for member', async () => {
          const response = await makeRequest(components.localFetch, '/community-voice-chat/join', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            connection_url: 'livekit:wss://voice.livekit.cloud?access_token=member-token'
          })

          expect(spyComponents.voice.getCommunityVoiceChatCredentialsForMember).toHaveBeenCalledWith(
            validCommunityId,
            validMemberAddress.toLowerCase()
          )
        })
      })
    })

    describe('when the authorization token is valid (aToken)', () => {
      beforeEach(() => {
        token = 'aToken'
        requestBody = {
          community_id: validCommunityId,
          member_address: validMemberAddress
        }
        spyComponents.voice.getCommunityVoiceChatCredentialsForMember.mockResolvedValueOnce({
          connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=valid-member-token'
        })
      })

      it('should respond with a 200 and the community voice chat credentials when using the valid auth token', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat/join', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
          connection_url: 'livekit:wss://voice.livekit.cloud?access_token=valid-member-token'
        })

        expect(spyComponents.voice.getCommunityVoiceChatCredentialsForMember).toHaveBeenCalledWith(
          validCommunityId,
          validMemberAddress.toLowerCase()
        )
      })
    })
  })
}) 