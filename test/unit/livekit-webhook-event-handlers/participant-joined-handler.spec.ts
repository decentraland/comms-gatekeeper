import { WebhookEvent } from 'livekit-server-sdk'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { Events, RoomType, UserJoinedRoomEvent } from '@dcl/schemas'
import { IPublisherComponent } from '@dcl/sns-component'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createParticipantJoinedHandler } from '../../../src/logic/livekit-webhook/event-handlers/participant-joined-handler'
import { IVoiceComponent } from '../../../src/logic/voice/types'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createAnalyticsMockedComponent } from '../../mocks/analytics-mocks'
import { createVoiceMockedComponent } from '../../mocks/voice-mock'
import { AnalyticsEvent } from '../../../src/types/analytics'
import { createPublisherMockedComponent } from '../../mocks/publisher-mock'
import { ILivekitComponent } from '../../../src/types/livekit.type'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { ISceneBansComponent } from '../../../src/logic/scene-bans/types'
import { createSceneBansMockedComponent } from '../../mocks/scene-bans-mock'

describe('Participant Joined Handler', () => {
  let handler: ReturnType<typeof createParticipantJoinedHandler>
  let voice: jest.Mocked<IVoiceComponent>
  let analytics: jest.Mocked<IAnalyticsComponent>
  let logs: jest.Mocked<ILoggerComponent>
  let handleParticipantJoinedMock: jest.MockedFunction<IVoiceComponent['handleParticipantJoined']>
  let fireEventMock: jest.MockedFunction<IAnalyticsComponent['fireEvent']>
  let publishMessagesMock: jest.MockedFunction<IPublisherComponent['publishMessages']>
  let getRoomMetadataFromRoomNameMock: jest.MockedFunction<ILivekitComponent['getRoomMetadataFromRoomName']>
  let updateRoomMetadataWithBansMock: jest.MockedFunction<ISceneBansComponent['updateRoomMetadataWithBans']>
  let publisher: jest.Mocked<IPublisherComponent>
  let livekit: jest.Mocked<ILivekitComponent>
  let sceneBans: jest.Mocked<ISceneBansComponent>

  beforeEach(() => {
    handleParticipantJoinedMock = jest.fn()
    fireEventMock = jest.fn()
    publishMessagesMock = jest.fn()
    getRoomMetadataFromRoomNameMock = jest.fn()
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
      getRoomMetadataFromRoomName: getRoomMetadataFromRoomNameMock
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
        getRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: undefined,
          worldName: undefined,
          realmName: undefined,
          roomType: RoomType.VOICE_CHAT
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

      it('should publish UserJoinedRoomEvent message for voice chat rooms', async () => {
        await handler.handle(webhookEvent)

        expect(publishMessagesMock).toHaveBeenCalledWith([
          {
            type: Events.Type.COMMS,
            subType: Events.SubType.Comms.USER_JOINED_ROOM,
            key: `user-joined-room-${roomName}-${userAddress.slice(0, 42)}`,
            timestamp: expect.any(Number),
            metadata: {
              sceneId: '',
              userAddress: userAddress,
              parcel: '',
              realmName: '',
              isWorld: false,
              voiceChatId: undefined,
              communityId: undefined,
              islandName: undefined,
              roomType: RoomType.VOICE_CHAT
            }
          }
        ])
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
        expect(getRoomMetadataFromRoomNameMock).not.toHaveBeenCalled()
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
        expect(getRoomMetadataFromRoomNameMock).not.toHaveBeenCalled()
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
        expect(getRoomMetadataFromRoomNameMock).not.toHaveBeenCalled()
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
        getRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId,
          worldName: undefined,
          realmName,
          roomType: RoomType.SCENE
        })
        expectedEvent = {
          type: Events.Type.COMMS,
          subType: Events.SubType.Comms.USER_JOINED_ROOM,
          key: `user-joined-room-${webhookEvent.room!.name}-${userAddress.slice(0, 42)}`,
          timestamp: expect.any(Number),
          metadata: {
            sceneId,
            userAddress: userAddress,
            parcel: '',
            realmName,
            isWorld: false,
            roomType: RoomType.SCENE
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
        getRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: undefined,
          worldName,
          realmName: undefined,
          roomType: RoomType.WORLD
        })
        expectedEvent = {
          type: Events.Type.COMMS,
          subType: Events.SubType.Comms.USER_JOINED_ROOM,
          key: `user-joined-room-${webhookEvent.room!.name}-${userAddress.slice(0, 42)}`,
          timestamp: expect.any(Number),
          metadata: {
            sceneId: '',
            userAddress: userAddress,
            parcel: '',
            realmName: worldName,
            isWorld: true,
            roomType: RoomType.WORLD
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

    describe('and room is a community voice chat room', () => {
      let communityId: string
      let expectedEvent: UserJoinedRoomEvent

      beforeEach(() => {
        communityId = 'community-123'
        webhookEvent.room!.name = `voice-chat-community-${communityId}`
        getRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: undefined,
          worldName: undefined,
          realmName: undefined,
          communityId,
          roomType: RoomType.COMMUNITY_VOICE_CHAT
        })
        expectedEvent = {
          type: Events.Type.COMMS,
          subType: Events.SubType.Comms.USER_JOINED_ROOM,
          key: `user-joined-room-${webhookEvent.room!.name}-${userAddress.slice(0, 42)}`,
          timestamp: expect.any(Number),
          metadata: {
            sceneId: '',
            userAddress: userAddress,
            parcel: '',
            realmName: '',
            isWorld: false,
            communityId,
            roomType: RoomType.COMMUNITY_VOICE_CHAT
          }
        }
      })

      it('should publish UserJoinedRoomEvent message with community metadata', async () => {
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

      it('should call the voice handler for community voice chat rooms', async () => {
        await handler.handle(webhookEvent)

        expect(handleParticipantJoinedMock).toHaveBeenCalledWith(userAddress, webhookEvent.room!.name)
      })
    })

    describe('and room is an island room', () => {
      let islandName: string
      let expectedEvent: UserJoinedRoomEvent

      beforeEach(() => {
        islandName = 'island-123'
        webhookEvent.room!.name = `island-${islandName}`
        getRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: undefined,
          worldName: undefined,
          realmName: undefined,
          islandName,
          roomType: RoomType.ISLAND
        })
        expectedEvent = {
          type: Events.Type.COMMS,
          subType: Events.SubType.Comms.USER_JOINED_ROOM,
          key: `user-joined-room-${webhookEvent.room!.name}-${userAddress.slice(0, 42)}`,
          timestamp: expect.any(Number),
          metadata: {
            sceneId: '',
            userAddress: userAddress,
            parcel: '',
            realmName: '',
            isWorld: false,
            islandName,
            roomType: RoomType.ISLAND
          }
        }
      })

      it('should publish UserJoinedRoomEvent message with island metadata', async () => {
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

      it('should not call the voice handler for island rooms', async () => {
        await handler.handle(webhookEvent)

        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
      })
    })

    describe('and room is an unknown room type', () => {
      beforeEach(() => {
        webhookEvent.room!.name = 'other-room-name'
        getRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: undefined,
          worldName: undefined,
          realmName: 'some-realm',
          roomType: RoomType.UNKNOWN
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

      it('should not call the voice handler', async () => {
        await handler.handle(webhookEvent)

        expect(handleParticipantJoinedMock).not.toHaveBeenCalled()
      })
    })

    describe('and message publishing fails', () => {
      let publishError: Error
      let sceneId: string

      beforeEach(() => {
        publishError = new Error('Publishing failed')
        sceneId = 'scene-123'
        webhookEvent.room!.name = 'scene-room-name'
        getRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId,
          worldName: undefined,
          realmName: 'realm-456',
          roomType: RoomType.SCENE
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
        // Mock the getRoomMetadataFromRoomName to return no scene/world data
        getRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: undefined,
          worldName: undefined,
          realmName: undefined,
          roomType: RoomType.VOICE_CHAT
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
        // Mock the getRoomMetadataFromRoomName to return no scene/world data
        getRoomMetadataFromRoomNameMock.mockReturnValue({
          sceneId: undefined,
          worldName: undefined,
          realmName: undefined,
          roomType: RoomType.VOICE_CHAT
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
