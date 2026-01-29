import {
  isPreviewRealm,
  isRoomEventValid,
  isVoiceChatRoom
} from '../../../src/logic/livekit-webhook/event-handlers/utils'
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

  describe('when calling isPreviewRealm', () => {
    describe('and the realm name is preview (lowercase)', () => {
      it('should return true', () => {
        expect(isPreviewRealm('preview')).toBe(true)
      })
    })

    describe('and the realm name is Preview (mixed case)', () => {
      it('should return true', () => {
        expect(isPreviewRealm('Preview')).toBe(true)
      })
    })

    describe('and the realm name is PREVIEW (uppercase)', () => {
      it('should return true', () => {
        expect(isPreviewRealm('PREVIEW')).toBe(true)
      })
    })

    describe('and the realm name is LocalPreview (mixed case)', () => {
      it('should return true', () => {
        expect(isPreviewRealm('LocalPreview')).toBe(true)
      })
    })

    describe('and the realm name is localpreview (lowercase)', () => {
      it('should return true', () => {
        expect(isPreviewRealm('localpreview')).toBe(true)
      })
    })

    describe('and the realm name is LOCALPREVIEW (uppercase)', () => {
      it('should return true', () => {
        expect(isPreviewRealm('LOCALPREVIEW')).toBe(true)
      })
    })

    describe('and the realm name is a production realm', () => {
      it('should return false for hela', () => {
        expect(isPreviewRealm('hela')).toBe(false)
      })

      it('should return false for dg', () => {
        expect(isPreviewRealm('dg')).toBe(false)
      })

      it('should return false for a world name', () => {
        expect(isPreviewRealm('myworld.eth')).toBe(false)
      })
    })

    describe('and the realm name is undefined', () => {
      it('should return false', () => {
        expect(isPreviewRealm(undefined)).toBe(false)
      })
    })

    describe('and the realm name is empty string', () => {
      it('should return false', () => {
        expect(isPreviewRealm('')).toBe(false)
      })
    })

    describe('and the realm name contains preview but is not exactly preview', () => {
      it('should return false for preview-something', () => {
        expect(isPreviewRealm('preview-something')).toBe(false)
      })

      it('should return false for my-preview', () => {
        expect(isPreviewRealm('my-preview')).toBe(false)
      })
    })
  })
})
