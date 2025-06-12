import { test } from '../../components'
import { setUserJoinedAt, setUserStatusUpdatedAt } from '../../db-utils'
import { makeRequest } from '../../utils'

test('GET /users/:address/voice-chat-status', ({ components, spyComponents }) => {
  let token: string
  const anAddress = '0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd'
  const anotherAddress = '0x1234567890123456789012345678901234567890'
  const roomName = 'voice-chat-123'

  describe('when the authorization token is invalid', () => {
    beforeEach(() => {
      token = 'an-invalid-token'
    })

    it('should respond with a 401 and a message saying that the token is invalid', async () => {
      const response = await makeRequest(components.localFetch, `/users/${anAddress}/voice-chat-status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      expect(response.status).toBe(401)
      expect(response.json()).resolves.toEqual({ error: 'Invalid authorization header' })
    })
  })

  describe('when the authorization token is valid', () => {
    beforeEach(() => {
      token = 'aToken'
    })

    describe('and the user is in a voice chat as not connected', () => {
      beforeEach(async () => {
        await components.voiceDB.createVoiceChatRoom(roomName, [anAddress, anotherAddress])
      })

      afterEach(async () => {
        await components.voiceDB.deletePrivateVoiceChat(roomName, anAddress)
      })

      describe('and is not expired', () => {
        it('should respond with a 200 and the property is_user_in_voice_chat as true', async () => {
          const response = await makeRequest(components.localFetch, `/users/${anAddress}/voice-chat-status`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            is_user_in_voice_chat: true
          })
        })
      })

      describe('and is expired', () => {
        beforeEach(async () => {
          // Expire connection
          const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
          await setUserJoinedAt(components.database, anAddress, roomName, twoHoursAgo)
        })

        it('should respond with a 200 and the property is_user_in_voice_chat as false', async () => {
          const response = await makeRequest(components.localFetch, `/users/${anAddress}/voice-chat-status`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            is_user_in_voice_chat: false
          })
        })
      })
    })

    describe('and the user is in a voice chat as connection interrupted', () => {
      beforeEach(async () => {
        await components.voiceDB.createVoiceChatRoom(roomName, [anAddress, anotherAddress])
        await components.voiceDB.updateUserStatusAsConnectionInterrupted(anAddress, roomName)
      })

      afterEach(async () => {
        await components.voiceDB.deletePrivateVoiceChat(roomName, anAddress)
      })

      describe('and is not expired', () => {
        it('should respond with a 200 and the property is_user_in_voice_chat as true', async () => {
          const response = await makeRequest(components.localFetch, `/users/${anAddress}/voice-chat-status`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            is_user_in_voice_chat: true
          })
        })
      })

      describe('and is expired', () => {
        beforeEach(async () => {
          // Expire connection
          const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
          await setUserStatusUpdatedAt(components.database, anAddress, roomName, twoHoursAgo)
        })

        it('should respond with a 200 and the property is_user_in_voice_chat as false', async () => {
          const response = await makeRequest(components.localFetch, `/users/${anAddress}/voice-chat-status`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          })
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body).toEqual({
            is_user_in_voice_chat: false
          })
        })
      })
    })

    describe('and the user is in a voice chat as connected', () => {
      beforeEach(async () => {
        await components.voiceDB.createVoiceChatRoom(roomName, [anAddress, anotherAddress])
        await components.voiceDB.joinUserToRoom(anAddress, roomName)
      })

      afterEach(async () => {
        await components.voiceDB.deletePrivateVoiceChat(roomName, anAddress)
      })

      it('should respond with a 200 and the property is_user_in_voice_chat as true', async () => {
        const response = await makeRequest(components.localFetch, `/users/${anAddress}/voice-chat-status`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          is_user_in_voice_chat: true
        })
      })
    })

    describe('and the user is not in a voice chat', () => {
      it('should respond with a 200 and the property is_user_in_voice_chat as false', async () => {
        const response = await makeRequest(components.localFetch, `/users/${anAddress}/voice-chat-status`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          is_user_in_voice_chat: false
        })
      })
    })

    describe('and the voice component throws an error', () => {
      const dbError = new Error('Database connection failed')

      beforeEach(() => {
        spyComponents.voice.isUserInVoiceChat.mockRejectedValue(dbError)
      })

      it('should respond with a 500 and a generic error message', async () => {
        const response = await makeRequest(components.localFetch, `/users/${anAddress}/voice-chat-status`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body).toEqual({
          error: 'Internal Server Error'
        })
        expect(spyComponents.voice.isUserInVoiceChat).toHaveBeenCalledWith(anAddress)
      })
    })
  })
})
