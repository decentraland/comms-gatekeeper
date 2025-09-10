import { WebhookEvent } from 'livekit-server-sdk'
import { createRoomStartedHandler } from '../../../src/logic/livekit-webhook/event-handlers/room-started-handler'
import { ILivekitComponent } from '../../../src/types/livekit.type'
import { ISceneBanManager } from '../../../src/types'
import { IPlacesComponent, PlaceAttributes } from '../../../src/types/places.type'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { IContentClientComponent } from '../../../src/types/content-client.type'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createPlacesMockedComponent, createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'
import { createSceneBanManagerMockedComponent } from '../../mocks/scene-ban-manager-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createContentClientMockedComponent } from '../../mocks/content-client-mock'
import { Entity, EntityType } from '@dcl/schemas'

describe('Room Started Handler', () => {
  let handler: ReturnType<typeof createRoomStartedHandler>
  let livekit: jest.Mocked<ILivekitComponent>
  let sceneBanManager: jest.Mocked<ISceneBanManager>
  let places: jest.Mocked<IPlacesComponent>
  let contentClient: jest.Mocked<IContentClientComponent>
  let logs: jest.Mocked<ILoggerComponent>
  let getSceneRoomMetadataFromRoomNameMock: jest.MockedFunction<ILivekitComponent['getSceneRoomMetadataFromRoomName']>
  let getPlaceByWorldNameMock: jest.MockedFunction<IPlacesComponent['getPlaceByWorldName']>
  let getPlaceByParcelMock: jest.MockedFunction<IPlacesComponent['getPlaceByParcel']>
  let listBannedAddressesMock: jest.MockedFunction<ISceneBanManager['listBannedAddresses']>
  let updateRoomMetadataMock: jest.MockedFunction<ILivekitComponent['updateRoomMetadata']>

  beforeEach(async () => {
    getSceneRoomMetadataFromRoomNameMock = jest.fn()
    getPlaceByWorldNameMock = jest.fn()
    getPlaceByParcelMock = jest.fn()
    listBannedAddressesMock = jest.fn()
    updateRoomMetadataMock = jest.fn()

    livekit = createLivekitMockedComponent({
      getSceneRoomMetadataFromRoomName: getSceneRoomMetadataFromRoomNameMock,
      updateRoomMetadata: updateRoomMetadataMock
    })

    sceneBanManager = createSceneBanManagerMockedComponent({
      listBannedAddresses: listBannedAddressesMock
    })

    places = createPlacesMockedComponent({
      getPlaceByWorldName: getPlaceByWorldNameMock,
      getPlaceByParcel: getPlaceByParcelMock
    })

    contentClient = createContentClientMockedComponent()

    logs = createLoggerMockedComponent()

    handler = createRoomStartedHandler({
      livekit,
      sceneBanManager,
      places,
      contentClient,
      logs
    })
  })

  describe('when handling room started event', () => {
    let webhookEvent: WebhookEvent

    beforeEach(() => {
      webhookEvent = {
        event: 'room_started',
        room: {
          name: 'scene-realm1:scene-id-123'
        }
      } as unknown as WebhookEvent
    })

    describe('and room data is missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
      })

      it('should return early without processing', async () => {
        await handler.handle(webhookEvent)

        expect(getSceneRoomMetadataFromRoomNameMock).not.toHaveBeenCalled()
        expect(getPlaceByWorldNameMock).not.toHaveBeenCalled()
        expect(getPlaceByParcelMock).not.toHaveBeenCalled()
        expect(listBannedAddressesMock).not.toHaveBeenCalled()
        expect(updateRoomMetadataMock).not.toHaveBeenCalled()
      })
    })

    describe('and room data is present', () => {
      describe('and room is neither scene nor world room', () => {
        beforeEach(() => {
          getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
            realmName: undefined,
            sceneId: undefined,
            worldName: undefined
          })
        })

        it('should return early without processing', async () => {
          await handler.handle(webhookEvent)

          expect(getSceneRoomMetadataFromRoomNameMock).toHaveBeenCalledWith(webhookEvent.room!.name)
          expect(getPlaceByWorldNameMock).not.toHaveBeenCalled()
          expect(getPlaceByParcelMock).not.toHaveBeenCalled()
          expect(listBannedAddressesMock).not.toHaveBeenCalled()
          expect(updateRoomMetadataMock).not.toHaveBeenCalled()
        })
      })

      describe('and room is a world room', () => {
        let worldPlace: any

        beforeEach(() => {
          worldPlace = createMockedWorldPlace({ id: 'world-place-id' })
          getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
            realmName: undefined,
            sceneId: undefined,
            worldName: 'test-world'
          })
          getPlaceByWorldNameMock.mockResolvedValue(worldPlace)
          listBannedAddressesMock.mockResolvedValue(['0x123', '0x456'])
        })

        it('should get place by world name and update room metadata with banned addresses', async () => {
          await handler.handle(webhookEvent)

          expect(getSceneRoomMetadataFromRoomNameMock).toHaveBeenCalledWith(webhookEvent.room!.name)
          expect(getPlaceByWorldNameMock).toHaveBeenCalledWith('test-world')
          expect(getPlaceByParcelMock).not.toHaveBeenCalled()
          expect(contentClient.fetchEntityById).not.toHaveBeenCalled()
          expect(listBannedAddressesMock).toHaveBeenCalledWith('world-place-id')
          expect(updateRoomMetadataMock).toHaveBeenCalledWith(webhookEvent.room!.name, {
            bannedAddresses: ['0x123', '0x456']
          })
        })

        describe('and getting place by world name fails', () => {
          beforeEach(() => {
            getPlaceByWorldNameMock.mockRejectedValue(new Error('World not found'))
          })

          it('should ignore the error and not throw', async () => {
            await handler.handle(webhookEvent)

            expect(getPlaceByWorldNameMock).toHaveBeenCalledWith('test-world')
            expect(listBannedAddressesMock).not.toHaveBeenCalled()
            expect(updateRoomMetadataMock).not.toHaveBeenCalled()
          })
        })
      })

      describe('and room is a scene room', () => {
        let scenePlace: PlaceAttributes
        let mockEntity: Entity

        beforeEach(() => {
          scenePlace = createMockedPlace({ id: 'scene-place-id' })
          mockEntity = {
            version: '1',
            id: 'scene-id-123',
            type: EntityType.SCENE,
            pointers: [],
            timestamp: Date.now(),
            content: [],
            metadata: {
              scene: {
                base: '-10,-10'
              }
            }
          }
          getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
            realmName: 'realm1',
            sceneId: 'scene-id-123',
            worldName: undefined
          })
          contentClient.fetchEntityById.mockResolvedValue(mockEntity)
          getPlaceByParcelMock.mockResolvedValue(scenePlace)
          listBannedAddressesMock.mockResolvedValue(['0x789', '0xabc'])
        })

        it('should fetch entity, get place by parcel and update room metadata with banned addresses', async () => {
          await handler.handle(webhookEvent)

          expect(getSceneRoomMetadataFromRoomNameMock).toHaveBeenCalledWith(webhookEvent.room!.name)
          expect(contentClient.fetchEntityById).toHaveBeenCalledWith('scene-id-123')
          expect(getPlaceByParcelMock).toHaveBeenCalledWith('-10,-10')
          expect(getPlaceByWorldNameMock).not.toHaveBeenCalled()
          expect(listBannedAddressesMock).toHaveBeenCalledWith('scene-place-id')
          expect(updateRoomMetadataMock).toHaveBeenCalledWith(webhookEvent.room!.name, {
            bannedAddresses: ['0x789', '0xabc']
          })
        })

        describe('and fetching entity fails', () => {
          beforeEach(() => {
            contentClient.fetchEntityById.mockRejectedValue(new Error('Catalyst error'))
          })

          it('should ignore the error and not throw', async () => {
            await handler.handle(webhookEvent)

            expect(contentClient.fetchEntityById).toHaveBeenCalledWith('scene-id-123')
            expect(getPlaceByParcelMock).not.toHaveBeenCalled()
            expect(listBannedAddressesMock).not.toHaveBeenCalled()
            expect(updateRoomMetadataMock).not.toHaveBeenCalled()
          })
        })

        describe('and getting place by parcel fails', () => {
          beforeEach(() => {
            getPlaceByParcelMock.mockRejectedValue(new Error('Place not found'))
          })

          it('should ignore the error and not throw', async () => {
            await handler.handle(webhookEvent)

            expect(getPlaceByParcelMock).toHaveBeenCalledWith('-10,-10')
            expect(listBannedAddressesMock).not.toHaveBeenCalled()
            expect(updateRoomMetadataMock).not.toHaveBeenCalled()
          })
        })
      })

      describe('and no banned addresses are found', () => {
        beforeEach(() => {
          getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
            realmName: undefined,
            sceneId: undefined,
            worldName: 'test-world'
          })
          getPlaceByWorldNameMock.mockResolvedValue(createMockedWorldPlace({ id: 'world-place-id' }))
          listBannedAddressesMock.mockResolvedValue([])
        })

        it('should update room metadata with empty banned addresses array', async () => {
          await handler.handle(webhookEvent)

          expect(updateRoomMetadataMock).toHaveBeenCalledWith(webhookEvent.room!.name, {
            bannedAddresses: []
          })
        })
      })

      describe('and getting banned addresses fails', () => {
        beforeEach(() => {
          getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
            realmName: undefined,
            sceneId: undefined,
            worldName: 'test-world'
          })
          getPlaceByWorldNameMock.mockResolvedValue(createMockedWorldPlace({ id: 'world-place-id' }))
          listBannedAddressesMock.mockRejectedValue(new Error('Database error'))
        })

        it('should ignore the error and not throw', async () => {
          await handler.handle(webhookEvent)

          expect(listBannedAddressesMock).toHaveBeenCalledWith('world-place-id')
          expect(updateRoomMetadataMock).not.toHaveBeenCalled()
        })
      })

      describe('and updating room metadata fails', () => {
        beforeEach(() => {
          getSceneRoomMetadataFromRoomNameMock.mockReturnValue({
            realmName: undefined,
            sceneId: undefined,
            worldName: 'test-world'
          })
          getPlaceByWorldNameMock.mockResolvedValue(createMockedWorldPlace({ id: 'world-place-id' }))
          listBannedAddressesMock.mockResolvedValue(['0x123', '0x456'])
          updateRoomMetadataMock.mockRejectedValue(new Error('LiveKit error'))
        })

        it('should ignore the error and not throw', async () => {
          await handler.handle(webhookEvent)

          expect(updateRoomMetadataMock).toHaveBeenCalledWith(webhookEvent.room!.name, {
            bannedAddresses: ['0x123', '0x456']
          })
        })
      })
    })
  })
})
