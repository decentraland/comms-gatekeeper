import { DisconnectReason } from '@livekit/protocol'
import { WebhookEvent } from 'livekit-server-sdk'
import { test } from '../components'
import { makeRequest } from '../utils'
import { VoiceChatUserStatus } from '../../src/adapters/db/types'

test('POST /livekit-webhook', ({ components, spyComponents }) => {
  const callerAddress = '0x1234567890123456789012345678901234567890'
  const calleeAddress = '0x1234567890123456789012345678901234567891'
  let webhookEvent: WebhookEvent

  beforeEach(() => {
    webhookEvent = {
      event: 'participant_left',
      room: {
        name: 'aRoomName'
      } as WebhookEvent['room'],
      participant: {
        identity: callerAddress
      } as WebhookEvent['participant']
    } as WebhookEvent

    spyComponents.livekit.getWebhookEvent.mockResolvedValue(webhookEvent)
    spyComponents.analytics.fireEvent.mockReturnValue(undefined)
  })

  describe('when the event is a participant left event', () => {
    beforeEach(() => {
      webhookEvent.event = 'participant_left'
    })

    describe('and the room is a voice chat room', () => {
      beforeEach(async () => {
        webhookEvent.room.name = 'voice-chat-private-123'  // Use correct private voice chat format
        await components.voiceDB.createVoiceChatRoom(webhookEvent.room.name, [callerAddress, calleeAddress])
        // Join the users to the room so they exist when we process the webhook
        await components.voiceDB.joinUserToRoom(callerAddress, webhookEvent.room.name)
        await components.voiceDB.joinUserToRoom(calleeAddress, webhookEvent.room.name)
      })

      afterEach(async () => {
        await components.voiceDB.deletePrivateVoiceChat(webhookEvent.room.name)
      })

      describe('and the user left voluntarily', () => {
        beforeEach(() => {
          webhookEvent.participant.disconnectReason = DisconnectReason.CLIENT_INITIATED
          spyComponents.livekit.deleteRoom.mockResolvedValue(undefined)
        })

        it('should respond with a 200 and set the user as disconnected', async () => {
          await makeRequest(components.localFetch, '/livekit-webhook', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer aToken',
              'Content-Type': 'application/json'
            },
            body: 'aBody'
          })

          await expect(components.voiceDB.getUsersInRoom(webhookEvent.room.name)).resolves.toContainEqual({
            address: callerAddress,
            roomName: webhookEvent.room.name,
            status: VoiceChatUserStatus.Disconnected,
            joinedAt: expect.any(Number),
            statusUpdatedAt: expect.any(Number)
          })
        })
      })

      describe('and the user left involuntarily', () => {
        beforeEach(() => {
          webhookEvent.participant.disconnectReason = DisconnectReason.MIGRATION
        })

        it('should respond with a 200 and set the user as connection interrupted', async () => {
          await makeRequest(components.localFetch, '/livekit-webhook', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer aToken',
              'Content-Type': 'application/json'
            },
            body: 'aBody'
          })

          // Check that the user was set to connection interrupted.
          await expect(components.voiceDB.getUsersInRoom(webhookEvent.room.name)).resolves.toContainEqual({
            address: callerAddress,
            roomName: webhookEvent.room.name,
            status: VoiceChatUserStatus.ConnectionInterrupted,
            joinedAt: expect.any(Number),
            statusUpdatedAt: expect.any(Number)
          })
        })
      })

      describe('and the user left involuntarily because of a duplicate identity', () => {
        beforeEach(() => {
          webhookEvent.participant.disconnectReason = DisconnectReason.DUPLICATE_IDENTITY
        })

        it('should respond with a 200 and do nothing', async () => {
          await makeRequest(components.localFetch, '/livekit-webhook', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer aToken',
              'Content-Type': 'application/json'
            },
            body: 'aBody'
          })

          expect(spyComponents.voice.handleParticipantLeft).not.toHaveBeenCalled()
        })
      })

      describe('and the user left involuntarily because of a room deletion', () => {
        beforeEach(() => {
          webhookEvent.participant.disconnectReason = DisconnectReason.ROOM_DELETED
        })

        it('should respond with a 200 and delete the room', async () => {
          await makeRequest(components.localFetch, '/livekit-webhook', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer aToken',
              'Content-Type': 'application/json'
            },
            body: 'aBody'
          })

          await expect(components.voiceDB.getUsersInRoom(webhookEvent.room.name)).resolves.toHaveLength(0)
        })
      })
    })

    describe('and the room is not a voice chat room', () => {
      beforeEach(() => {
        webhookEvent.room.name = 'not-a-voice-chat-room'
      })

      it('should respond with a 200 and do nothing', async () => {
        await makeRequest(components.localFetch, '/livekit-webhook', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer aToken',
            'Content-Type': 'application/json'
          },
          body: 'aBody'
        })
        expect(spyComponents.voiceDB.updateUserStatusAsDisconnected).not.toHaveBeenCalled()
      })
    })
  })

  describe('when the event is a participant joined event', () => {
    beforeEach(() => {
      webhookEvent.event = 'participant_joined'
    })

    describe('and the room is a voice chat room', () => {
      beforeEach(async () => {
        webhookEvent.room.name = 'voice-chat-private-123'  // Use correct private voice chat format
        await components.voiceDB.createVoiceChatRoom(webhookEvent.room.name, [callerAddress, calleeAddress])
      })

      afterEach(async () => {
        await components.voiceDB.deletePrivateVoiceChat(webhookEvent.room.name)
      })

      describe('and the private room is active', () => {
        beforeEach(async () => {
          // Join the user to the first room to make it active.
          await components.voiceDB.joinUserToRoom(callerAddress, webhookEvent.room.name)
        })

        describe('and the user is joining a different room', () => {
          let oldRoomName: string

          beforeEach(async () => {
            oldRoomName = webhookEvent.room.name
            webhookEvent.room.name = 'voice-chat-private-456'  // Use correct private voice chat format
            await components.voiceDB.createVoiceChatRoom(webhookEvent.room.name, [callerAddress, calleeAddress])
            spyComponents.livekit.deleteRoom.mockResolvedValue(undefined)
          })

          afterEach(async () => {
            await components.voiceDB.deletePrivateVoiceChat(webhookEvent.room.name)
            webhookEvent.room.name = oldRoomName
          })

          it('should respond with a 200, join the user to the new room, disconnect the user from the old one and delete the old room in livekit', async () => {
            await makeRequest(components.localFetch, '/livekit-webhook', {
              method: 'POST',
              headers: {
                Authorization: 'Bearer aToken',
                'Content-Type': 'application/json'
              },
              body: 'aBody'
            })

            // Check that the user was disconnected from the old room.
            await expect(components.voiceDB.getUsersInRoom(oldRoomName)).resolves.toContainEqual({
              address: callerAddress,
              roomName: oldRoomName,
              status: VoiceChatUserStatus.Disconnected,
              joinedAt: expect.any(Number),
              statusUpdatedAt: expect.any(Number)
            })

            // Check that the user was joined to the new room.
            await expect(components.voiceDB.getUsersInRoom(webhookEvent.room.name)).resolves.toContainEqual({
              address: callerAddress,
              roomName: webhookEvent.room.name,
              status: VoiceChatUserStatus.Connected,
              joinedAt: expect.any(Number),
              statusUpdatedAt: expect.any(Number)
            })

            // Check that the old room was deleted.
            expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(oldRoomName)
          })
        })

        describe('and the user is joining the same room', () => {
          beforeEach(() => {
            webhookEvent.room.name = 'voice-chat-private-123'
          })

          it('should respond with a 200 and join the user to the room', async () => {
            await makeRequest(components.localFetch, '/livekit-webhook', {
              method: 'POST',
              headers: {
                Authorization: 'Bearer aToken',
                'Content-Type': 'application/json'
              },
              body: 'aBody'
            })

            // Check that the user was joined to the room.
            await expect(components.voiceDB.getUsersInRoom(webhookEvent.room.name)).resolves.toContainEqual({
              address: callerAddress,
              roomName: webhookEvent.room.name,
              status: VoiceChatUserStatus.Connected,
              joinedAt: expect.any(Number),
              statusUpdatedAt: expect.any(Number)
            })
          })
        })
      })

      describe('and the private room is not active due to a user having left voluntarily', () => {
        beforeEach(async () => {
          await components.voiceDB.joinUserToRoom(callerAddress, webhookEvent.room.name)
          await components.voiceDB.joinUserToRoom(calleeAddress, webhookEvent.room.name)
          await components.voiceDB.updateUserStatusAsDisconnected(callerAddress, webhookEvent.room.name)
        })

        it('should respond with a 200 and delete the room', async () => {
          await makeRequest(components.localFetch, '/livekit-webhook', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer aToken',
              'Content-Type': 'application/json'
            },
            body: 'aBody'
          })

          expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(webhookEvent.room.name)
        })
      })

      describe('and the private room does not exist', () => {
        beforeEach(async () => {
          spyComponents.livekit.deleteRoom.mockResolvedValue(undefined)
          await components.voiceDB.deletePrivateVoiceChat(webhookEvent.room.name)
        })

        it('should respond with a 200 and delete the livekit room', async () => {
          await makeRequest(components.localFetch, '/livekit-webhook', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer aToken',
              'Content-Type': 'application/json'
            },
            body: 'aBody'
          })

          expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(webhookEvent.room.name)
        })
      })
    })

    describe('and the room is not a voice chat room', () => {
      beforeEach(() => {
        webhookEvent.room.name = 'not-a-voice-chat-room'
      })

      it('should respond with a 200 and do nothing', async () => {
        await makeRequest(components.localFetch, '/livekit-webhook', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer aToken',
            'Content-Type': 'application/json'
          },
          body: 'aBody'
        })

        expect(spyComponents.voice.handleParticipantJoined).not.toHaveBeenCalled()
      })
    })
  })
})
