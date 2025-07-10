import { getPrivateVoiceChatRoomName } from '../../../src/logic/voice/utils'
import { test } from '../../components'
import { setUserJoinedAt } from '../../db-utils'
import { makeRequest } from '../../utils'

test('DELETE /private-voice-chat/:id', ({ components, spyComponents }) => {
  let requestBody: any
  let token: string
  const anAddress = '0x5babd1869989570988b79b5f5086e17a9e96a235'
  const anotherAddress = '0x742d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0'
  const roomId = 'test-room-123'
  const usersInRoom = [anAddress, anotherAddress]

  describe('when the authorization token is invalid', () => {
    beforeEach(() => {
      token = 'an-invalid-token'
      requestBody = {
        address: anAddress
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

    describe('and the request body is an invalid JSON', () => {
      beforeEach(() => {
        requestBody = 'invalid-json'
      })

      it('should respond with a 400 and a message saying that the request body is invalid', async () => {
        const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: requestBody
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'Invalid request body' })
      })
    })

    describe('and the address is missing from the request body', () => {
      beforeEach(() => {
        requestBody = {}
      })

      it('should respond with a 400 and a message saying that address is required', async () => {
        const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'Invalid request body, missing address' })
      })
    })

    describe('and the address is null', () => {
      beforeEach(() => {
        requestBody = { address: null }
      })

      it('should respond with a 400 and a message saying that address is required', async () => {
        const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'Invalid request body, missing address' })
      })
    })

    describe('and the address is an empty string', () => {
      beforeEach(() => {
        requestBody = { address: '' }
      })

      it('should respond with a 400 and a message saying that address is required', async () => {
        const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'Invalid request body, missing address' })
      })
    })

    describe('and the address is invalid', () => {
      beforeEach(() => {
        requestBody = { address: 'invalid-address' }
      })

      it('should respond with a 400 and a message saying that the address is invalid', async () => {
        const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(requestBody)
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({ error: 'Invalid request body, invalid address' })
      })
    })

    describe('and the address is valid', () => {
      beforeEach(() => {
        requestBody = { address: anAddress }
      })

      describe('and the room does not exist', () => {
        it('should respond with a 404 and a message saying that the room does not exist', async () => {
          const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
          })
          const body = await response.json()

          expect(response.status).toBe(404)
          expect(body).toEqual({ error: `Room ${roomId} does not exist` })
        })
      })

      describe('and the room exists', () => {
        let roomName: string

        beforeEach(async () => {
          roomName = getPrivateVoiceChatRoomName(roomId)
          await components.voiceDB.createVoiceChatRoom(roomName, usersInRoom)
          spyComponents.livekit.deleteRoom.mockResolvedValue(undefined)
        })

        afterEach(async () => {
          await components.voiceDB.deletePrivateVoiceChat(roomName)
        })

        describe('and the user is in a voice chat as not connected', () => {
          describe('and the connection is not expired', () => {
            it('should delete the room and respond with a 200 and the users in the voice chat', async () => {
              const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
              })
              const body = await response.json()

              expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(getPrivateVoiceChatRoomName(roomId))
              expect(response.status).toBe(200)
              expect(body).toEqual({
                users_in_voice_chat: expect.arrayContaining(usersInRoom)
              })
            })
          })

          describe('and the connection is expired', () => {
            beforeEach(async () => {
              const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
              await setUserJoinedAt(components.database, anAddress, roomName, twoHoursAgo)
            })

            it('should delete the room and respond with a 200 and the users in the voice chat', async () => {
              const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
              })
              const body = await response.json()

              expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(getPrivateVoiceChatRoomName(roomId))
              expect(response.status).toBe(200)
              expect(body).toEqual({
                users_in_voice_chat: expect.arrayContaining(usersInRoom)
              })
            })
          })
        })

        describe('and the user is in a voice chat as connection interrupted', () => {
          beforeEach(async () => {
            await components.voiceDB.updateUserStatusAsConnectionInterrupted(anAddress, roomId)
          })

          describe('and the connection is not expired', () => {
            it('should delete the room and respond with a 200 and the users in the voice chat', async () => {
              const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
              })
              const body = await response.json()

              expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(getPrivateVoiceChatRoomName(roomId))
              expect(response.status).toBe(200)
              expect(body).toEqual({
                users_in_voice_chat: expect.arrayContaining(usersInRoom)
              })
            })
          })

          describe('and the connection is expired', () => {
            beforeEach(async () => {
              const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
              await setUserJoinedAt(components.database, anAddress, roomName, twoHoursAgo)
            })

            it('should delete the room and respond with a 200 and the users in the voice chat', async () => {
              const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
              })
              const body = await response.json()

              expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(getPrivateVoiceChatRoomName(roomId))
              expect(response.status).toBe(200)
              expect(body).toEqual({
                users_in_voice_chat: expect.arrayContaining(usersInRoom)
              })
            })
          })
        })

        describe('and the user is in a voice chat as connected', () => {
          beforeEach(async () => {
            await components.voiceDB.joinUserToRoom(anAddress, roomName)
          })

          it('should delete the room and respond with a 200 and the users in the voice chat', async () => {
            const response = await makeRequest(components.localFetch, `/private-voice-chat/${roomId}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify(requestBody)
            })

            expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(getPrivateVoiceChatRoomName(roomId))
            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body).toEqual({
              users_in_voice_chat: expect.arrayContaining(usersInRoom)
            })
          })
        })
      })
    })
  })
})
