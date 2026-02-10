import { isRoomEventValid, isVoiceChatRoom } from '../../../src/logic/livekit-webhook/event-handlers/utils'
import { WebhookEvent } from 'livekit-server-sdk'

describe('webhook event handler utils', () => {
  describe('when calling isVoiceChatRoom', () => {
    describe('and the room name starts with voice-chat', () => {
      let webhookEvent: WebhookEvent

      beforeEach(() => {
        webhookEvent = {
          room: {
            name: 'voice-chat-private-123'
          }
        } as WebhookEvent
      })

      it('should return true', () => {
        expect(isVoiceChatRoom(webhookEvent)).toBe(true)
      })
    })

    describe('and the room name does not start with voice-chat', () => {
      let webhookEvent: WebhookEvent

      beforeEach(() => {
        webhookEvent = {
          room: {
            name: 'scene-room-name'
          }
        } as WebhookEvent
      })

      it('should return false', () => {
        expect(isVoiceChatRoom(webhookEvent)).toBe(false)
      })
    })

    describe('and the room is undefined', () => {
      let webhookEvent: WebhookEvent

      beforeEach(() => {
        webhookEvent = {} as WebhookEvent
      })

      it('should return false', () => {
        expect(isVoiceChatRoom(webhookEvent)).toBe(false)
      })
    })
  })

  describe('when calling isRoomEventValid', () => {
    describe('and room and participant are present with valid data', () => {
      let webhookEvent: WebhookEvent

      beforeEach(() => {
        webhookEvent = {
          room: { name: 'test-room' },
          participant: { identity: '0x123' }
        } as unknown as WebhookEvent
      })

      it('should return true', () => {
        expect(isRoomEventValid(webhookEvent)).toBe(true)
      })
    })

    describe('and room is missing', () => {
      let webhookEvent: WebhookEvent

      beforeEach(() => {
        webhookEvent = {
          participant: { identity: '0x123' }
        } as unknown as WebhookEvent
      })

      it('should return false', () => {
        expect(isRoomEventValid(webhookEvent)).toBe(false)
      })
    })

    describe('and participant is missing', () => {
      let webhookEvent: WebhookEvent

      beforeEach(() => {
        webhookEvent = {
          room: { name: 'test-room' }
        } as unknown as WebhookEvent
      })

      it('should return false', () => {
        expect(isRoomEventValid(webhookEvent)).toBe(false)
      })
    })
  })

})
