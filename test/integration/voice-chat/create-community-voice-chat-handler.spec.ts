import { test } from '../../components'
import { makeRequest } from '../../utils'
import { CommunityVoiceChatAction } from '../../../src/types/community-voice'

test('POST /community-voice-chat', ({ components, spyComponents }) => {
  let token: string
  let requestBody: { community_id: string; user_address: string; action: CommunityVoiceChatAction }
  const validUserAddress = '0x5babd1869989570988b79b5f5086e17a9e96a235'
  const validCommunityId = 'test-community-123'

  describe('when no authorization header is provided', () => {
    beforeEach(() => {
      requestBody = {
        community_id: validCommunityId,
        user_address: validUserAddress,
        action: CommunityVoiceChatAction.CREATE
      }
    })

    it('should respond with a 401 and a message saying access is forbidden', async () => {
      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
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
        user_address: validUserAddress,
        action: CommunityVoiceChatAction.CREATE
      }
    })

    it('should respond with a 401 and a message saying that the token is invalid', async () => {
      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
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

    describe('when action is missing', () => {
      beforeEach(() => {
        requestBody = {
          community_id: validCommunityId,
          user_address: validUserAddress
        } as any
      })

      it('should respond with a 400 and a message saying that action is required', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'The property action is required and must be one of: create, join' })
      })
    })

    describe('when action is invalid', () => {
      beforeEach(() => {
        requestBody = {
          community_id: validCommunityId,
          user_address: validUserAddress,
          action: 'invalid-action' as any
        }
      })

      it('should respond with a 400 and a message saying that action must be create or join', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'The property action is required and must be one of: create, join' })
      })
    })

    describe('when community_id is missing', () => {
      beforeEach(() => {
        requestBody = {
          user_address: validUserAddress,
          action: CommunityVoiceChatAction.CREATE
        } as any
      })

      it('should respond with a 400 and a message saying that community_id is required', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat', {
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

    describe('when user_address is missing', () => {
      beforeEach(() => {
        requestBody = {
          community_id: validCommunityId
        } as any
      })

      it('should respond with a 400 and a message saying that user_address is required', async () => {
        const response = await makeRequest(components.localFetch, '/community-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'The property user_address is required' })
      })
    })

    describe('CREATE action', () => {
      beforeEach(() => {
        requestBody = {
          community_id: validCommunityId,
          user_address: validUserAddress,
          action: CommunityVoiceChatAction.CREATE
        }
      })

      describe('when getting community voice chat credentials for moderator fails', () => {
        beforeEach(() => {
          components.voice.getCommunityVoiceChatCredentialsForModerator = jest
            .fn()
            .mockRejectedValue(new Error('Failed to get community voice chat credentials'))
        })

        it('should respond with a 500', async () => {
          const response = await makeRequest(components.localFetch, '/community-voice-chat', {
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

      describe('when getting community voice chat credentials for moderator succeeds', () => {
        beforeEach(() => {
          components.voice.getCommunityVoiceChatCredentialsForModerator = jest.fn().mockResolvedValue({
            connectionUrl: 'livekit:wss://test.livekit.cloud?access_token=test-token'
          })
        })

        it('should respond with a 200 and the connection URL', async () => {
          const response = await makeRequest(components.localFetch, '/community-voice-chat', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            connection_url: 'livekit:wss://test.livekit.cloud?access_token=test-token'
          })
          expect(components.voice.getCommunityVoiceChatCredentialsForModerator).toHaveBeenCalledWith(
            validCommunityId,
            validUserAddress.toLowerCase()
          )
        })
      })
    })

    describe('JOIN action', () => {
      beforeEach(() => {
        requestBody = {
          community_id: validCommunityId,
          user_address: validUserAddress,
          action: CommunityVoiceChatAction.JOIN
        }
      })

      describe('when getting community voice chat credentials for member fails', () => {
        beforeEach(() => {
          components.voice.getCommunityVoiceChatCredentialsForMember = jest
            .fn()
            .mockRejectedValue(new Error('Failed to get community voice chat credentials'))
        })

        it('should respond with a 500', async () => {
          const response = await makeRequest(components.localFetch, '/community-voice-chat', {
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

      describe('when getting community voice chat credentials for member succeeds', () => {
        beforeEach(() => {
          components.voice.getCommunityVoiceChatCredentialsForMember = jest.fn().mockResolvedValue({
            connectionUrl: 'livekit:wss://test.livekit.cloud?access_token=member-token'
          })
        })

        it('should respond with a 200 and the connection URL', async () => {
          const response = await makeRequest(components.localFetch, '/community-voice-chat', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            connection_url: 'livekit:wss://test.livekit.cloud?access_token=member-token'
          })
          expect(components.voice.getCommunityVoiceChatCredentialsForMember).toHaveBeenCalledWith(
            validCommunityId,
            validUserAddress.toLowerCase()
          )
        })
      })
    })
  })
})
