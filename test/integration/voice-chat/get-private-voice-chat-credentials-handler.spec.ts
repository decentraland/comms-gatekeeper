import { LivekitCredentials } from '../../../src/types/livekit.type'
import { test } from '../../components'
import { makeRequest } from '../../utils'

test('POST /private-voice-chat', ({ components, spyComponents }) => {
  let token: string
  let body: any
  const validAddress1 = '0x5babd1869989570988b79b5f5086e17a9e96a235'
  const validAddress2 = '0x742d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0'

  describe('when the authorization token is invalid', () => {
    beforeEach(() => {
      token = 'an-invalid-token'
      body = {
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
          roomId: 'a-room-id',
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
          roomId: 'a-room-id',
          user_addresses: [validAddress1]
        }
      })

      it('should respond with a 400 when user_addresses has only one address', async () => {
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
          roomId: 'a-room-id',
          userAddresses: [validAddress1, validAddress2, '0x123d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0']
        }
      })
      it('should respond with a 400 when user_addresses has three addresses', async () => {
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
          roomId: 'a-room-id',
          user_addresses: []
        }
      })

      it('should respond with a 400 when user_addresses is empty', async () => {
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

    describe('when user_addresses contains invalid ethereum addresses', () => {
      const invalidAddress = 'invalid-address'
      beforeEach(() => {
        body = {
          room_id: 'a-room-id',
          user_addresses: [invalidAddress, validAddress2]
        }
      })

      it('should respond with a 400 when the first address is invalid', async () => {
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

    describe('when roomId is missing', () => {
      beforeEach(() => {
        body = {
          user_addresses: [validAddress1, validAddress2]
        }
      })

      it('should respond with a 400 when roomId is missing', async () => {
        const response = await makeRequest(components.localFetch, '/private-voice-chat', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        })

        expect(response.status).toBe(400)
        expect(response.json()).resolves.toEqual({ error: 'The property roomId is required' })
      })
    })

    describe('when the request is valid', () => {
      beforeEach(() => {
        body = {
          room_id: 'a-room-id',
          user_addresses: [validAddress1, validAddress2]
        }
      })

      describe('and getting private voice chat credentials fails', () => {
        beforeEach(() => {
          spyComponents.voice.getPrivateVoiceChatRoomCredentials.mockRejectedValueOnce(
            new Error('Failed to get private voice chat credentials')
          )
        })

        it('should respond with a 500', async () => {
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
          spyComponents.voice.getPrivateVoiceChatRoomCredentials.mockResolvedValueOnce(mockCredentials)
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
          expect(spyComponents.voice.getPrivateVoiceChatRoomCredentials).toHaveBeenCalledWith([
            validAddress1.toLowerCase(),
            validAddress2.toLowerCase()
          ])
          expect(response.json()).resolves.toEqual(mockCredentials)
        })
      })
    })
  })
})
