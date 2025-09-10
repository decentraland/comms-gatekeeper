import { WebhookEvent } from 'livekit-server-sdk'
import { createParticipantJoinedHandler } from '../../../src/logic/livekit-webhook/event-handlers/participant-joined-handler'
import { IVoiceComponent } from '../../../src/logic/voice/types'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createAnalyticsMockedComponent } from '../../mocks/analytics-mocks'
import { createVoiceMockedComponent } from '../../mocks/voice-mock'
import { AnalyticsEvent } from '../../../src/types/analytics'

describe('Participant Joined Handler', () => {
  let handler: ReturnType<typeof createParticipantJoinedHandler>
  let voice: jest.Mocked<IVoiceComponent>
  let analytics: jest.Mocked<IAnalyticsComponent>
  let logs: jest.Mocked<ILoggerComponent>
  let handleParticipantJoinedMock: jest.MockedFunction<IVoiceComponent['handleParticipantJoined']>
  let fireEventMock: jest.MockedFunction<IAnalyticsComponent['fireEvent']>

  beforeEach(() => {
    handleParticipantJoinedMock = jest.fn()
    fireEventMock = jest.fn()

    voice = createVoiceMockedComponent({
      handleParticipantJoined: handleParticipantJoinedMock
    })

    analytics = createAnalyticsMockedComponent({
      fireEvent: fireEventMock
    })

    logs = createLoggerMockedComponent()

    handler = createParticipantJoinedHandler({
      voice,
      analytics,
      logs
    })
  })

  describe('when handling participant joined event', () => {
    let userAddress: string
    let roomName: string
    let webhookEvent: WebhookEvent

    beforeEach(() => {
      userAddress = '0x1234567890123456789012345678901234567890'
      roomName = 'voice-chat-private-123'
      webhookEvent = {
        event: 'participant_joined',
        room: {
          name: roomName
        },
        participant: {
          identity: userAddress
        }
      } as unknown as WebhookEvent
    })

    describe('and room and participant data are valid', () => {
      it('should fire analytics event with correct parameters', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: roomName,
          address: userAddress
        })
      })

      describe('and room is a voice chat room', () => {
        it('should call voice.handleParticipantJoined and log debug message', async () => {
          await handler.handle(webhookEvent)

          expect(handleParticipantJoinedMock).toHaveBeenCalledWith(userAddress, roomName)
        })
      })

      describe('and room is not a voice chat room', () => {
        beforeEach(() => {
          webhookEvent.room!.name = 'not-a-voice-chat-room'
        })

        it('should not call voice.handleParticipantJoined', async () => {
          await handler.handle(webhookEvent)

          expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
            room: 'not-a-voice-chat-room',
            address: userAddress
          })
          expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
        })
      })
    })

    describe('and room data is missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
      })

      it('should fire analytics event with unknown values and not call voice methods', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: 'Unknown',
          address: userAddress
        })
        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
      })
    })

    describe('and participant data is missing', () => {
      beforeEach(() => {
        webhookEvent.participant = undefined
      })

      it('should fire analytics event with unknown values and not call voice methods', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: roomName,
          address: 'Unknown'
        })
        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
      })
    })

    describe('and both room and participant data are missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
        webhookEvent.participant = undefined
      })

      it('should fire analytics event with unknown values and not call voice methods', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: 'Unknown',
          address: 'Unknown'
        })
        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
      })
    })

    describe('and handling that a participant joined fails', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('Voice handler failed')
        handleParticipantJoinedMock.mockRejectedValue(error)
      })

      it('should reject with the error', async () => {
        await expect(handler.handle(webhookEvent)).rejects.toThrow(error)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: roomName,
          address: userAddress
        })
        expect(handleParticipantJoinedMock).toHaveBeenCalledWith(userAddress, roomName)
      })
    })

    describe('and firing the analytics event fails', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('Analytics failed')
        fireEventMock.mockImplementation(() => {
          throw error
        })
      })

      it('should reject with the error', async () => {
        await expect(handler.handle(webhookEvent)).rejects.toThrow(error)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: roomName,
          address: userAddress
        })
        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
      })
    })
  })
})
