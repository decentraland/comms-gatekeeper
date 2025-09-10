import { WebhookEvent } from 'livekit-server-sdk'
import { createParticipantLeftHandler } from '../../../src/logic/livekit-webhook/event-handlers/participant-left-handler'
import { IVoiceComponent } from '../../../src/logic/voice/types'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createAnalyticsMockedComponent } from '../../mocks/analytics-mocks'
import { createVoiceMockedComponent } from '../../mocks/voice-mock'
import { AnalyticsEvent } from '../../../src/types/analytics'
import { DisconnectReason } from '@livekit/protocol'

describe('Participant Left Handler', () => {
  let handler: ReturnType<typeof createParticipantLeftHandler>
  let voice: jest.Mocked<IVoiceComponent>
  let analytics: jest.Mocked<IAnalyticsComponent>
  let logs: jest.Mocked<ILoggerComponent>
  let handleParticipantLeftMock: jest.MockedFunction<IVoiceComponent['handleParticipantLeft']>
  let fireEventMock: jest.MockedFunction<IAnalyticsComponent['fireEvent']>

  beforeEach(() => {
    handleParticipantLeftMock = jest.fn()
    fireEventMock = jest.fn()

    voice = createVoiceMockedComponent({
      handleParticipantLeft: handleParticipantLeftMock
    })

    analytics = createAnalyticsMockedComponent({
      fireEvent: fireEventMock
    })

    logs = createLoggerMockedComponent()

    handler = createParticipantLeftHandler({
      voice,
      analytics,
      logs
    })
  })

  describe('when handling participant left event', () => {
    let userAddress: string
    let roomName: string
    let disconnectReason: DisconnectReason
    let webhookEvent: WebhookEvent

    beforeEach(() => {
      userAddress = '0x1234567890123456789012345678901234567890'
      roomName = 'voice-chat-private-123'
      disconnectReason = DisconnectReason.CLIENT_INITIATED
      webhookEvent = {
        event: 'participant_left',
        room: {
          name: roomName
        },
        participant: {
          identity: userAddress,
          disconnectReason
        }
      } as unknown as WebhookEvent
    })

    describe('and room and participant data are valid', () => {
      it('should fire analytics event with correct parameters', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
          room: roomName,
          address: userAddress,
          reason: disconnectReason.toString()
        })
      })

      describe('and room is a voice chat room', () => {
        it('should call the participant left handler and log the debug message', async () => {
          await handler.handle(webhookEvent)

          expect(handleParticipantLeftMock).toHaveBeenCalledWith(userAddress, roomName, disconnectReason)
        })
      })

      describe('and room is not a voice chat room', () => {
        beforeEach(() => {
          webhookEvent.room!.name = 'not-a-voice-chat-room'
        })

        it('should not call the participant left handler', async () => {
          await handler.handle(webhookEvent)

          expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
            room: 'not-a-voice-chat-room',
            address: userAddress,
            reason: disconnectReason.toString()
          })
          expect(handleParticipantLeftMock).not.toHaveBeenCalled()
        })
      })
    })

    describe('and room data is missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
      })

      it('should fire analytics event with unknown values and not call voice methods', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
          room: 'Unknown',
          address: userAddress,
          reason: disconnectReason.toString()
        })
        expect(handleParticipantLeftMock).not.toHaveBeenCalled()
      })
    })

    describe('and participant data is missing', () => {
      beforeEach(() => {
        webhookEvent.participant = undefined
      })

      it('should fire analytics event with unknown values and not call voice methods', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
          room: roomName,
          address: 'Unknown',
          reason: 'Unknown'
        })
        expect(handleParticipantLeftMock).not.toHaveBeenCalled()
      })
    })

    describe('and both room and participant data are missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
        webhookEvent.participant = undefined
      })

      it('should fire analytics event with unknown values and not call voice methods', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
          room: 'Unknown',
          address: 'Unknown',
          reason: 'Unknown'
        })
        expect(handleParticipantLeftMock).not.toHaveBeenCalled()
      })
    })

    describe('and disconnect reason is missing', () => {
      beforeEach(() => {
        webhookEvent.participant!.disconnectReason = undefined
      })

      it('should fire analytics event with unknown reason', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
          room: roomName,
          address: userAddress,
          reason: 'Unknown'
        })
      })
    })

    describe('and the participant left handler fails', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('Voice handler failed')
        handleParticipantLeftMock.mockRejectedValue(error)
      })

      it('should reject with the error', async () => {
        await expect(handler.handle(webhookEvent)).rejects.toThrow(error)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
          room: roomName,
          address: userAddress,
          reason: disconnectReason.toString()
        })
        expect(handleParticipantLeftMock).toHaveBeenCalledWith(userAddress, roomName, disconnectReason)
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

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_LEFT_ROOM, {
          room: roomName,
          address: userAddress,
          reason: disconnectReason.toString()
        })
        expect(handleParticipantLeftMock).not.toHaveBeenCalled()
      })
    })
  })
})
