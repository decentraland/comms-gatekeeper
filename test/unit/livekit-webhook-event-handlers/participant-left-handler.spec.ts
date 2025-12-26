import { WebhookEvent } from 'livekit-server-sdk'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { Events, RoomType } from '@dcl/schemas'
import { IPublisherComponent } from '@dcl/sns-component'
import { DisconnectReason } from '@livekit/protocol'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createParticipantLeftHandler } from '../../../src/logic/livekit-webhook/event-handlers/participant-left-handler'
import { IVoiceComponent } from '../../../src/logic/voice/types'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createAnalyticsMockedComponent } from '../../mocks/analytics-mocks'
import { createVoiceMockedComponent } from '../../mocks/voice-mock'
import { AnalyticsEvent } from '../../../src/types/analytics'
import { ILivekitComponent, RoomMetadata } from '../../../src/types/livekit.type'
import { createPublisherMockedComponent } from '../../mocks/publisher-mock'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'

describe('Participant Left Handler', () => {
  let handler: ReturnType<typeof createParticipantLeftHandler>
  let publishMessagesMock: jest.MockedFunction<IPublisherComponent['publishMessages']>
  let getRoomMetadataFromRoomNameMock: jest.MockedFunction<ILivekitComponent['getRoomMetadataFromRoomName']>
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
    getRoomMetadataFromRoomNameMock = jest.fn()
    publishMessagesMock = jest.fn()

    voice = createVoiceMockedComponent({
      handleParticipantLeft: handleParticipantLeftMock
    })

    livekit = createLivekitMockedComponent({
      getRoomMetadataFromRoomName: getRoomMetadataFromRoomNameMock
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
    let roomMetadata: RoomMetadata

    beforeEach(() => {
      userAddress = '0x1234567890123456789012345678901234567890'
      roomName = 'voice-chat-private-123'
      disconnectReason = DisconnectReason.CLIENT_INITIATED
      roomMetadata = {
        sceneId: undefined,
        worldName: undefined,
        realmName: undefined,
        roomType: RoomType.VOICE_CHAT
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
      getRoomMetadataFromRoomNameMock.mockReturnValueOnce(roomMetadata)
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
              key: `user-left-room-${webhookEvent.room!.name}-${userAddress.slice(0, 42)}`,
              timestamp: expect.any(Number),
              metadata: {
                sceneId: 'scene-id-123',
                userAddress: userAddress,
                isWorld: false,
                realmName: 'a-realm-name',
                roomType: RoomType.VOICE_CHAT,
                islandName: undefined,
                communityId: undefined,
                voiceChatId: undefined
              }
            }
          ])
        })
      })

      describe('and room is a world room', () => {
        beforeEach(() => {
          webhookEvent.room!.name = 'world-world-name-123'
          getRoomMetadataFromRoomNameMock.mockReturnValueOnce({
            sceneId: undefined,
            worldName: 'world-world-name-123',
            realmName: undefined,
            roomType: RoomType.WORLD
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

      describe('and room is a community voice chat room', () => {
        let communityId: string

        beforeEach(() => {
          getRoomMetadataFromRoomNameMock.mockReset()
          communityId = 'community-123'
          webhookEvent.room!.name = `voice-chat-community-${communityId}`
          getRoomMetadataFromRoomNameMock.mockReturnValue({
            sceneId: undefined,
            worldName: undefined,
            realmName: undefined,
            communityId,
            roomType: RoomType.COMMUNITY_VOICE_CHAT
          })
        })

        it('should publish the user left room event with community metadata', async () => {
          await handler.handle(webhookEvent)

          expect(publishMessagesMock).toHaveBeenCalledWith([
            expect.objectContaining({
              type: Events.Type.COMMS,
              subType: Events.SubType.Comms.USER_LEFT_ROOM,
              key: `user-left-room-${webhookEvent.room!.name}-${userAddress.slice(0, 42)}`,
              timestamp: expect.any(Number),
              metadata: expect.objectContaining({
                userAddress: userAddress,
                isWorld: false,
                realmName: '',
                communityId,
                roomType: RoomType.COMMUNITY_VOICE_CHAT
              })
            })
          ])
        })

        it('should call the participant left handler for community voice chat rooms', async () => {
          await handler.handle(webhookEvent)

          expect(handleParticipantLeftMock).toHaveBeenCalledWith(userAddress, webhookEvent.room!.name, disconnectReason)
        })
      })

      describe('and room is an island room', () => {
        let islandName: string

        beforeEach(() => {
          getRoomMetadataFromRoomNameMock.mockReset()
          islandName = 'island-123'
          webhookEvent.room!.name = `island-${islandName}`
          getRoomMetadataFromRoomNameMock.mockReturnValue({
            sceneId: undefined,
            worldName: undefined,
            realmName: undefined,
            islandName,
            roomType: RoomType.ISLAND
          })
        })

        it('should publish the user left room event with island metadata', async () => {
          await handler.handle(webhookEvent)

          expect(publishMessagesMock).toHaveBeenCalledWith([
            expect.objectContaining({
              type: Events.Type.COMMS,
              subType: Events.SubType.Comms.USER_LEFT_ROOM,
              key: `user-left-room-${webhookEvent.room!.name}-${userAddress.slice(0, 42)}`,
              timestamp: expect.any(Number),
              metadata: expect.objectContaining({
                userAddress: userAddress,
                isWorld: false,
                realmName: '',
                islandName,
                roomType: RoomType.ISLAND
              })
            })
          ])
        })

        it('should not call the participant left handler for island rooms', async () => {
          await handler.handle(webhookEvent)

          expect(handleParticipantLeftMock).not.toHaveBeenCalled()
        })
      })

      describe('and room is an unknown room type', () => {
        beforeEach(() => {
          getRoomMetadataFromRoomNameMock.mockReset()
          webhookEvent.room!.name = 'unknown-room-type'
          getRoomMetadataFromRoomNameMock.mockReturnValue({
            sceneId: undefined,
            worldName: undefined,
            realmName: undefined,
            roomType: RoomType.UNKNOWN
          })
        })

        it('should not publish any message', async () => {
          await handler.handle(webhookEvent)

          expect(publishMessagesMock).not.toHaveBeenCalled()
        })

        it('should not fire analytics event', async () => {
          await handler.handle(webhookEvent)

          expect(fireEventMock).not.toHaveBeenCalled()
        })

        it('should not call the participant left handler', async () => {
          await handler.handle(webhookEvent)

          expect(handleParticipantLeftMock).not.toHaveBeenCalled()
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
        getRoomMetadataFromRoomNameMock.mockReturnValueOnce({
          sceneId: undefined,
          worldName: undefined,
          realmName: undefined,
          roomType: RoomType.VOICE_CHAT
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
        getRoomMetadataFromRoomNameMock.mockReturnValueOnce({
          sceneId: undefined,
          worldName: undefined,
          realmName: undefined,
          roomType: RoomType.VOICE_CHAT
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
