import { VoiceChatUserStatus } from '../../../src/adapters/db/types'
import { getPrivateVoiceChatRoomName } from '../../../src/logic/voice/utils'
import { LivekitCredentials } from '../../../src/types/livekit.type'
import { test } from '../../components'
import { makeRequest } from '../../utils'

test('POST /private-voice-chat', ({ components, spyComponents }) => {
  let token: string
  let body: any
  const anAddress = '0x5babd1869989570988b79b5f5086e17a9e96a235'
  const anotherAddress = '0x742d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0'

  describe('when the authorization token is invalid', () => {
    beforeEach(() => {
      token = 'an-invalid-token'
      body = {
        room_id: 'a-room-id',
        user_addresses: [anAddress, anotherAddress]
      }
    })

    it('should respond with a 401 and a message saying that the token is invalid', async () => {
      const response = await makeRequest(components.localFetch, '/private-voice-chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })

      expect(response.status).toBe(401)
      expect(response.json()).resolves.toEqual({ error: 'Invalid authorization header' })
    })
  })

  describe('when the authorization token is valid', () => {
    beforeEach(() => {
      token = 'aToken'
    })

    describe('when the request body is an invalid JSON', () => {
      beforeEach(() => {
        body = 'invalid-json'
      })

      it('should respond with a 400 and a message saying that the request body is invalid', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: 'invalid-json'
        })

        expect(response.status).toBe(400)
        expect(response.json()).resolves.toEqual({ error: 'Invalid request body' })
      })
    })

    describe('when user_addresses is missing', () => {
      beforeEach(() => {
        body = {}
      })

      it('should respond with a 400 and a message saying that user_addresses is required', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        })

        expect(response.status).toBe(400)
        expect(response.json()).resolves.toEqual({
          error: 'The property user_addresses is required and must be an array'
        })
      })
    })

    describe('when user_addresses is not an array', () => {
      beforeEach(() => {
        body = {
          room_id: 'a-room-id',
          user_addresses: 'not-an-array'
        }
      })

      it('should respond with a 400 and a message saying that user_addresses must be an array', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        })

        expect(response.status).toBe(400)
        expect(response.json()).resolves.toEqual({
          error: 'The property user_addresses is required and must be an array'
        })
      })
    })

    describe('when user_addresses has one address', () => {
      beforeEach(() => {
        body = {
          room_id: 'a-room-id',
          user_addresses: [anAddress]
        }
      })

      it('should respond with a 400 and a message saying that user_addresses must have two addresses', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        })

        expect(response.status).toBe(400)
        expect(response.json()).resolves.toEqual({ error: 'The property user_addresses must have two addresses' })
      })
    })

    describe('when user_addresses has more than two addresses', () => {
      beforeEach(() => {
        body = {
          room_id: 'a-room-id',
          user_addresses: [anAddress, anotherAddress, '0x123d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0']
        }
      })

      it('should respond with a 400 and a message saying that user_addresses must have two addresses', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        })

        expect(response.status).toBe(400)
        expect(response.json()).resolves.toEqual({ error: 'The property user_addresses must have two addresses' })
      })
    })

    describe('when user_addresses is empty', () => {
      beforeEach(() => {
        body = {
          room_id: 'a-room-id',
          user_addresses: []
        }
      })

      it('should respond with a 400 and a message saying that user_addresses must have two addresses', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        })

        expect(response.status).toBe(400)
        expect(response.json()).resolves.toEqual({
          error: 'The property user_addresses must have two addresses'
        })
      })
    })

    describe('when user_addresses contains invalid ethereum addresses', () => {
      const invalidAddress = 'invalid-address'
      beforeEach(() => {
        body = {
          room_id: 'a-room-id',
          user_addresses: [invalidAddress, anotherAddress]
        }
      })

      it('should respond with a 400 and a message saying that the first address is invalid', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        })

        expect(response.status).toBe(400)
        expect(response.json()).resolves.toEqual({ error: `Invalid address: ${invalidAddress}` })
      })
    })

    describe('when room_id is missing', () => {
      beforeEach(() => {
        body = {
          user_addresses: [anAddress, anotherAddress]
        }
      })

      it('should respond with a 400 and a message saying that room_id is required', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        })

        expect(response.status).toBe(400)
        expect(response.json()).resolves.toEqual({ error: 'The property room_id is required' })
      })
    })

    describe('when the request is valid', () => {
      beforeEach(() => {
        body = {
          room_id: 'a-room-id',
          user_addresses: [anAddress, anotherAddress]
        }
      })

      describe('and getting private voice chat credentials fails', () => {
        beforeEach(() => {
          spyComponents.livekit.generateCredentials.mockRejectedValueOnce(
            new Error('Failed to get private voice chat credentials')
          )
        })

        it('should respond with a 500 and a message saying that the request failed', async () => {
          const response = await makeRequest(components.localFetch, '/private-voice-chat', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(body)
          })

          expect(response.status).toBe(500)
          expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' })
        })
      })

      describe('and getting private voice chat credentials succeeds', () => {
        let mockCredentials: Record<string, LivekitCredentials>
        let roomName: string

        beforeEach(() => {
          roomName = getPrivateVoiceChatRoomName(body.room_id)
          mockCredentials = {
            [anAddress.toLowerCase()]: {
              token: 'voice-chat-token-1',
              url: 'wss://voice.livekit.cloud'
            },
            [anotherAddress.toLowerCase()]: {
              token: 'voice-chat-token-2',
              url: 'wss://voice.livekit.cloud'
            }
          }
          spyComponents.livekit.generateCredentials
            .mockResolvedValueOnce(mockCredentials[anAddress.toLowerCase()])
            .mockResolvedValueOnce(mockCredentials[anotherAddress.toLowerCase()])
        })

        afterEach(async () => {
          try {
            await components.voiceDB.deletePrivateVoiceChat(roomName, anAddress)
          } catch (error) {
            // Do nothing
          }
        })

        it('should respond with a 200 and the voice chat credentials', async () => {
          const response = await makeRequest(components.localFetch, '/private-voice-chat', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(body)
          })

          expect(response.status).toBe(200)
          expect(response.json()).resolves.toEqual({
            [anAddress.toLowerCase()]: {
              connection_url: `livekit:${mockCredentials[anAddress.toLowerCase()].url}?access_token=${mockCredentials[anAddress.toLowerCase()].token}`
            },
            [anotherAddress.toLowerCase()]: {
              connection_url: `livekit:${mockCredentials[anotherAddress.toLowerCase()].url}?access_token=${mockCredentials[anotherAddress.toLowerCase()].token}`
            }
          })
          await expect(components.voiceDB.getUsersInRoom(roomName)).resolves.toEqual([
            {
              address: anAddress.toLowerCase(),
              roomName,
              status: VoiceChatUserStatus.NotConnected,
              joinedAt: expect.any(Number),
              statusUpdatedAt: expect.any(Number)
            },
            {
              address: anotherAddress.toLowerCase(),
              roomName,
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
