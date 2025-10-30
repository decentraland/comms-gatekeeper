import { VoiceChatUserStatus } from '../../../src/adapters/db/types'
import { getPrivateVoiceChatRoomName } from '../../../src/logic/voice/utils'
import { LivekitCredentials } from '../../../src/types/livekit.type'
import { test } from '../../components'
import { makeRequest } from '../../utils'

test('POST /private-voice-chat', ({ components, spyComponents }) => {
  let token: string
  let requestBody: { room_id: string; user_addresses: string[] }
  const validAddress1 = '0x5babd1869989570988b79b5f5086e17a9e96a235'
  const validAddress2 = '0x742d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0'

  describe('when the authorization token is invalid', () => {
    beforeEach(() => {
      token = 'an-invalid-token'
      requestBody = {
        room_id: 'a-room-id',
        user_addresses: [validAddress1, validAddress2]
      }
    })

    it('should respond with a 401 and a message saying that the token is invalid', async () => {
      const response = await makeRequest(components.localFetch, '/private-voice-chat', {
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

      it('should respond with a 400 for invalid JSON body', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: 'invalid-json'
        })
        expect(response.status).toBe(400)
      })
    })

    describe('when user_addresses is missing', () => {
      beforeEach(() => {
        requestBody = {} as any
      })

      it('should respond with a 400 when user_addresses is missing', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        expect(response.status).toBe(400)
      })
    })

    describe('when user_addresses is not an array', () => {
      beforeEach(() => {
        requestBody = {
          room_id: 'a-room-id',
          user_addresses: 'not-an-array' as any
        }
      })

      it('should respond with a 400 when user_addresses is not an array', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        expect(response.status).toBe(400)
      })
    })

    describe('when user_addresses has one address', () => {
      beforeEach(() => {
        requestBody = {
          room_id: 'a-room-id',
          user_addresses: [validAddress1]
        }
      })

      it('should respond with a 400 when user_addresses has only one address', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        expect(response.status).toBe(400)
      })
    })

    describe('when user_addresses has more than two addresses', () => {
      beforeEach(() => {
        requestBody = {
          room_id: 'a-room-id',
          user_addresses: [validAddress1, validAddress2, '0x123d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0']
        }
      })

      it('should respond with a 400 when user_addresses has three addresses', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        expect(response.status).toBe(400)
      })
    })

    describe('when user_addresses is empty', () => {
      beforeEach(() => {
        requestBody = {
          room_id: 'a-room-id',
          user_addresses: []
        }
      })

      it('should respond with a 400 when user_addresses is empty', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        expect(response.status).toBe(400)
      })
    })

    describe('when user_addresses contains invalid ethereum addresses', () => {
      const invalidAddress = 'invalid-address'
      beforeEach(() => {
        requestBody = {
          room_id: 'a-room-id',
          user_addresses: [invalidAddress, validAddress2]
        }
      })

      it('should respond with a 400 when an address is invalid', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        expect(response.status).toBe(400)
      })
    })

    describe('when room_id is missing', () => {
      beforeEach(() => {
        requestBody = {
          user_addresses: [validAddress1, validAddress2]
        } as any
      })

      it('should respond with a 400 when room_id is missing', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        expect(response.status).toBe(400)
      })
    })

    describe('when the request is valid', () => {
      beforeEach(() => {
        requestBody = {
          room_id: 'a-room-id',
          user_addresses: [validAddress1, validAddress2]
        }
      })

      describe('and getting private voice chat credentials fails', () => {
        beforeEach(() => {
          spyComponents.livekit.generateCredentials.mockRejectedValueOnce(
            new Error('Failed to get private voice chat credentials')
          )
        })

        it('should respond with a 500', async () => {
          const response = await makeRequest(components.localFetch, '/private-voice-chat', {
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

      describe('and getting private voice chat credentials succeeds', () => {
        let mockCredentials: Record<string, LivekitCredentials>

        beforeEach(() => {
          mockCredentials = {
            [validAddress1.toLowerCase()]: {
              token: 'voice-chat-token-1',
              url: 'wss://voice.livekit.cloud'
            },
            [validAddress2.toLowerCase()]: {
              token: 'voice-chat-token-2',
              url: 'wss://voice.livekit.cloud'
            }
          }
          spyComponents.livekit.generateCredentials
            .mockResolvedValueOnce(mockCredentials[validAddress1.toLowerCase()])
            .mockResolvedValueOnce(mockCredentials[validAddress2.toLowerCase()])
        })

        afterEach(async () => {
          await components.voiceDB.deletePrivateVoiceChat(getPrivateVoiceChatRoomName(requestBody.room_id))
        })

        it('should create respond with a 200 and the voice chat credentials', async () => {
          const response = await makeRequest(components.localFetch, '/private-voice-chat', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            [validAddress1.toLowerCase()]: {
              connection_url: `livekit:${mockCredentials[validAddress1.toLowerCase()].url}?access_token=${mockCredentials[validAddress1.toLowerCase()].token}`
            },
            [validAddress2.toLowerCase()]: {
              connection_url: `livekit:${mockCredentials[validAddress2.toLowerCase()].url}?access_token=${mockCredentials[validAddress2.toLowerCase()].token}`
            }
          })
          await expect(
            components.voiceDB.getUsersInRoom(getPrivateVoiceChatRoomName(requestBody.room_id))
          ).resolves.toEqual([
            {
              address: validAddress1.toLowerCase(),
              roomName: getPrivateVoiceChatRoomName(requestBody.room_id),
              status: VoiceChatUserStatus.NotConnected,
              joinedAt: expect.any(Number),
              statusUpdatedAt: expect.any(Number)
            },
            {
              address: validAddress2.toLowerCase(),
              roomName: getPrivateVoiceChatRoomName(requestBody.room_id),
              status: VoiceChatUserStatus.NotConnected,
              joinedAt: expect.any(Number),
              statusUpdatedAt: expect.any(Number)
            }
          ])
        })
      })
    })
  })
})
