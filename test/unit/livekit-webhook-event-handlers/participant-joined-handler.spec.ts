import { WebhookEvent } from 'livekit-server-sdk'
import { createParticipantJoinedHandler } from '../../../src/logic/livekit-webhook/event-handlers/participant-joined-handler'
import { IVoiceComponent } from '../../../src/logic/voice/types'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createAnalyticsMockedComponent } from '../../mocks/analytics-mocks'
import { createVoiceMockedComponent } from '../../mocks/voice-mock'
import { AnalyticsEvent } from '../../../src/types/analytics'
import { createPublisherMockedComponent } from '../../mocks/publisher-mock'
import { IPublisherComponent } from '../../../src/types'
import { ILivekitComponent } from '../../../src/types/livekit.type'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { ISceneBansComponent } from '../../../src/logic/scene-bans/types'
import { createSceneBansMockedComponent } from '../../mocks/scene-bans-mock'
import { Events, UserJoinedRoomEvent } from '@dcl/schemas'

describe('Participant Joined Handler', () => {
  let handler: ReturnType<typeof createParticipantJoinedHandler>
  let voice: jest.Mocked<IVoiceComponent>
  let analytics: jest.Mocked<IAnalyticsComponent>
  let logs: jest.Mocked<ILoggerComponent>
  let handleParticipantJoinedMock: jest.MockedFunction<IVoiceComponent['handleParticipantJoined']>
  let fireEventMock: jest.MockedFunction<IAnalyticsComponent['fireEvent']>
  let publishMessagesMock: jest.MockedFunction<IPublisherComponent['publishMessages']>
  let getSceneRoomMetadataFromRoomNameMock: jest.MockedFunction<ILivekitComponent['getSceneRoomMetadataFromRoomName']>
  let updateRoomMetadataWithBansMock: jest.MockedFunction<ISceneBansComponent['updateRoomMetadataWithBans']>
  let publisher: jest.Mocked<IPublisherComponent>
  let livekit: jest.Mocked<ILivekitComponent>
  let sceneBans: jest.Mocked<ISceneBansComponent>

  beforeEach(() => {
    handleParticipantJoinedMock = jest.fn()
    fireEventMock = jest.fn()
    publishMessagesMock = jest.fn()
    getSceneRoomMetadataFromRoomNameMock = jest.fn()
    updateRoomMetadataWithBansMock = jest.fn()

    voice = createVoiceMockedComponent({
      handleParticipantJoined: handleParticipantJoinedMock
    })

    analytics = createAnalyticsMockedComponent({
      fireEvent: fireEventMock
    })

    publisher = createPublisherMockedComponent({
      publishMessages: publishMessagesMock
    })

    livekit = createLivekitMockedComponent({
      getSceneRoomMetadataFromRoomName: getSceneRoomMetadataFromRoomNameMock
    })

    sceneBans = createSceneBansMockedComponent({
      updateRoomMetadataWithBans: updateRoomMetadataWithBansMock
    })

    logs = createLoggerMockedComponent()

    handler = createParticipantJoinedHandler({
      voice,
      analytics,
      logs,
      livekit,
      publisher,
      sceneBans
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

    describe('and room is a voice chat room', () => {
      beforeEach(() => {
        // Default mock to return no scene/world metadata for voice chat rooms
        getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: null,
          worldName: null,
          realmName: null
        })
      })

      it('should fire analytics event with correct parameters', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: roomName,
          address: userAddress
        })
      })

      it('should call the participant joined handler', async () => {
        await handler.handle(webhookEvent)

        expect(handleParticipantJoinedMock).toHaveBeenCalledWith(userAddress, roomName)
      })

      it('should call sceneBans.updateRoomMetadataWithBans', async () => {
        await handler.handle(webhookEvent)

        expect(updateRoomMetadataWithBansMock).toHaveBeenCalledWith(webhookEvent.room)
      })

      it('should not publish any message for voice chat rooms', async () => {
        await handler.handle(webhookEvent)

        expect(publishMessagesMock).not.toHaveBeenCalled()
      })
    })

    describe('and room data is missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
      })

      it('should return early and not perform any action', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).not.toHaveBeenCalled()
        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
        expect(publishMessagesMock).not.toHaveBeenCalled()
        expect(getSceneRoomMetadataFromRoomNameMock).not.toHaveBeenCalled()
      })
    })

    describe('and participant data is missing', () => {
      beforeEach(() => {
        webhookEvent.participant = undefined
      })

      it('should return early and not perform any action', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).not.toHaveBeenCalled()
        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
        expect(publishMessagesMock).not.toHaveBeenCalled()
        expect(getSceneRoomMetadataFromRoomNameMock).not.toHaveBeenCalled()
      })
    })

    describe('and both room and participant data are missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
        webhookEvent.participant = undefined
      })

      it('should return early and not perform any action', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).not.toHaveBeenCalled()
        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
        expect(publishMessagesMock).not.toHaveBeenCalled()
        expect(getSceneRoomMetadataFromRoomNameMock).not.toHaveBeenCalled()
      })
    })

    describe('and room is a scene room', () => {
      let sceneId: string
      let realmName: string
      let expectedEvent: UserJoinedRoomEvent

      beforeEach(() => {
        sceneId = 'scene-123'
        realmName = 'realm-456'
        webhookEvent.room!.name = 'scene-room-name'
        getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId,
          worldName: null,
          realmName
        })
        expectedEvent = {
          type: Events.Type.COMMS,
          subType: Events.SubType.Comms.USER_JOINED_ROOM,
          key: `user-joined-room-${webhookEvent.room!.name}`,
          timestamp: expect.any(Number),
          metadata: {
            sceneId,
            userAddress: userAddress,
            parcel: '',
            realmName,
            isWorld: false
          }
        }
      })

      it('should publish UserJoinedRoomEvent message with scene metadata', async () => {
        await handler.handle(webhookEvent)

        expect(publishMessagesMock).toHaveBeenCalledWith([expectedEvent])
      })

      it('should fire analytics event', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: webhookEvent.room!.name,
          address: userAddress
        })
      })

      it('should call sceneBans.updateRoomMetadataWithBans', async () => {
        await handler.handle(webhookEvent)

        expect(updateRoomMetadataWithBansMock).toHaveBeenCalledWith(webhookEvent.room)
      })

      it('should not call the voice handler', async () => {
        await handler.handle(webhookEvent)

        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
      })
    })

    describe('and room is a world room', () => {
      let worldName: string
      let expectedEvent: UserJoinedRoomEvent

      beforeEach(() => {
        worldName = 'world-789'
        webhookEvent.room!.name = 'world-room-name'
        getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: null,
          worldName,
          realmName: null
        })
        expectedEvent = {
          type: Events.Type.COMMS,
          subType: Events.SubType.Comms.USER_JOINED_ROOM,
          key: `user-joined-room-${webhookEvent.room!.name}`,
          timestamp: expect.any(Number),
          metadata: {
            sceneId: '',
            userAddress: userAddress,
            parcel: '',
            realmName: worldName,
            isWorld: true
          }
        }
      })

      it('should publish UserJoinedRoomEvent message with world metadata', async () => {
        await handler.handle(webhookEvent)

        expect(publishMessagesMock).toHaveBeenCalledWith([expectedEvent])
      })

      it('should fire analytics event', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: webhookEvent.room!.name,
          address: userAddress
        })
      })

      it('should call sceneBans.updateRoomMetadataWithBans', async () => {
        await handler.handle(webhookEvent)

        expect(updateRoomMetadataWithBansMock).toHaveBeenCalledWith(webhookEvent.room)
      })

      it('should not call the voice handler', async () => {
        await handler.handle(webhookEvent)

        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
      })
    })

    describe('and room is neither scene nor world room', () => {
      beforeEach(() => {
        webhookEvent.room!.name = 'other-room-name'
        getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: null,
          worldName: null,
          realmName: 'some-realm'
        })
      })

      it('should not publish any message', async () => {
        await handler.handle(webhookEvent)

        expect(publishMessagesMock).not.toHaveBeenCalled()
      })

      it('should still fire analytics event', async () => {
        await handler.handle(webhookEvent)

        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: webhookEvent.room!.name,
          address: userAddress
        })
      })

      it('should still call sceneBans.updateRoomMetadataWithBans', async () => {
        await handler.handle(webhookEvent)

        expect(updateRoomMetadataWithBansMock).toHaveBeenCalledWith(webhookEvent.room)
      })
    })

    describe('and message publishing fails', () => {
      let publishError: Error
      let sceneId: string

      beforeEach(() => {
        publishError = new Error('Publishing failed')
        sceneId = 'scene-123'
        webhookEvent.room!.name = 'scene-room-name'
        getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId,
          worldName: null,
          realmName: 'realm-456'
        })
        publishMessagesMock.mockRejectedValue(publishError)
      })

      it('should log error but not throw', async () => {
        await expect(handler.handle(webhookEvent)).resolves.not.toThrow()

        expect(publishMessagesMock).toHaveBeenCalled()
        expect(fireEventMock).toHaveBeenCalledWith(AnalyticsEvent.PARTICIPANT_JOINED_ROOM, {
          room: webhookEvent.room!.name,
          address: userAddress
        })
      })
    })

    describe('and handling that a participant joined fails', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('Voice handler failed')
        handleParticipantJoinedMock.mockRejectedValue(error)
        // Mock the getSceneRoomMetadataFromRoomName to return no scene/world data
        getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: null,
          worldName: null,
          realmName: null
        })
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
        // Mock the getSceneRoomMetadataFromRoomName to return no scene/world data
        getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: null,
          worldName: null,
          realmName: null
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
