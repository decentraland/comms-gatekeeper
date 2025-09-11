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
import { IPublisherComponent } from '../../../src/types'
import { ILivekitComponent, SceneRoomMetadata } from '../../../src/types/livekit.type'
import { createPublisherMockedComponent } from '../../mocks/publisher-mock'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { Events } from '@dcl/schemas'

describe('Participant Left Handler', () => {
  let handler: ReturnType<typeof createParticipantLeftHandler>
  let publishMessagesMock: jest.MockedFunction<IPublisherComponent['publishMessages']>
  let getSceneRoomMetadataFromRoomNameMock: jest.MockedFunction<ILivekitComponent['getSceneRoomMetadataFromRoomName']>
  let voice: jest.Mocked<IVoiceComponent>
  let analytics: jest.Mocked<IAnalyticsComponent>
  let logs: jest.Mocked<ILoggerComponent>
  let handleParticipantLeftMock: jest.MockedFunction<IVoiceComponent['handleParticipantLeft']>
  let fireEventMock: jest.MockedFunction<IAnalyticsComponent['fireEvent']>
  let livekit: jest.Mocked<ILivekitComponent>
  let publisher: jest.Mocked<IPublisherComponent>

  beforeEach(() => {
    handleParticipantLeftMock = jest.fn()
    fireEventMock = jest.fn()
    getSceneRoomMetadataFromRoomNameMock = jest.fn()
    publishMessagesMock = jest.fn()

    voice = createVoiceMockedComponent({
      handleParticipantLeft: handleParticipantLeftMock
    })

    livekit = createLivekitMockedComponent({
      getSceneRoomMetadataFromRoomName: getSceneRoomMetadataFromRoomNameMock
    })
    publisher = createPublisherMockedComponent({
      publishMessages: publishMessagesMock
    })

    analytics = createAnalyticsMockedComponent({
      fireEvent: fireEventMock
    })

    logs = createLoggerMockedComponent()

    handler = createParticipantLeftHandler({
      voice,
      analytics,
      logs,
      livekit,
      publisher
    })
  })

  describe('when handling participant left event', () => {
    let userAddress: string
    let roomName: string
    let disconnectReason: DisconnectReason
    let webhookEvent: WebhookEvent
    let roomMetadata: SceneRoomMetadata

    beforeEach(() => {
      userAddress = '0x1234567890123456789012345678901234567890'
      roomName = 'voice-chat-private-123'
      disconnectReason = DisconnectReason.CLIENT_INITIATED
      roomMetadata = {
        sceneId: undefined,
        worldName: undefined,
        realmName: undefined
      }
      webhookEvent = {
        event: 'participant_left',
        room: {
          name: roomName
        },
        participant: {
          identity: userAddress,
          disconnectReason
        }
      } as WebhookEvent
      getSceneRoomMetadataFromRoomNameMock.mockReturnValueOnce(roomMetadata)
    })

    describe('and room and participant data are valid', () => {
      beforeEach(() => {
        roomMetadata.realmName = 'a-realm-name'
        roomMetadata.sceneId = 'a-scene-id'
      })

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

      describe('and room is a genesis city scene room', () => {
        beforeEach(() => {
          webhookEvent.room!.name = 'genesis-city-prd-scene-room-a-realm-name:scene-id-123'

          roomMetadata.realmName = 'a-realm-name'
          roomMetadata.sceneId = 'scene-id-123'
        })

        it('should publish the user left room event', async () => {
          await handler.handle(webhookEvent)

          expect(publishMessagesMock).toHaveBeenCalledWith([
            {
              type: Events.Type.COMMS,
              subType: Events.SubType.Comms.USER_LEFT_ROOM,
              key: `user-left-room-${webhookEvent.room!.name}`,
              timestamp: expect.any(Number),
              metadata: {
                sceneId: 'scene-id-123',
                userAddress: userAddress,
                isWorld: false,
                realmName: 'a-realm-name'
              }
            }
          ])
        })
      })

      describe('and room is a world room', () => {
        beforeEach(() => {
          webhookEvent.room!.name = 'world-world-name-123'
          getSceneRoomMetadataFromRoomNameMock.mockReturnValueOnce({
            sceneId: undefined,
            worldName: 'world-world-name-123',
            realmName: undefined
          })
        })

        it('should publish the user left room event', async () => {
          await handler.handle(webhookEvent)

          expect(publishMessagesMock).toHaveBeenCalledWith([
            expect.objectContaining({
              type: Events.Type.COMMS,
              subType: Events.SubType.Comms.USER_LEFT_ROOM
            })
          ])
        })
      })

      describe('and publishing the user left room event fails', () => {
        beforeEach(() => {
          publishMessagesMock.mockRejectedValue(new Error('Failed to publish user left room event'))
        })

        it('should not reject with the error and continue', async () => {
          await handler.handle(webhookEvent)
          expect(analytics.fireEvent).toHaveBeenCalled()
          expect(handleParticipantLeftMock).toHaveBeenCalled()
        })
      })
    })

    describe('and room data is missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
      })

      it('should early return and not call any other method', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).not.toHaveBeenCalled()
        expect(handleParticipantLeftMock).not.toHaveBeenCalled()
        expect(publishMessagesMock).not.toHaveBeenCalled()
      })
    })

    describe('and participant data is missing', () => {
      beforeEach(() => {
        webhookEvent.participant = undefined
      })

      it('should early return and not call any other method', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).not.toHaveBeenCalled()
        expect(handleParticipantLeftMock).not.toHaveBeenCalled()
        expect(publishMessagesMock).not.toHaveBeenCalled()
      })
    })

    describe('and both room and participant data are missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
        webhookEvent.participant = undefined
      })

      it('should early return and not call any other method', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).not.toHaveBeenCalled()
        expect(handleParticipantLeftMock).not.toHaveBeenCalled()
        expect(publishMessagesMock).not.toHaveBeenCalled()
      })
    })

    describe('and the participant left handler fails', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('Voice handler failed')
        handleParticipantLeftMock.mockRejectedValue(error)
        getSceneRoomMetadataFromRoomNameMock.mockReturnValueOnce({
          sceneId: undefined,
          worldName: undefined,
          realmName: undefined
        })
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
        getSceneRoomMetadataFromRoomNameMock.mockReturnValueOnce({
          sceneId: undefined,
          worldName: undefined,
          realmName: undefined
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
