import { WebhookEvent } from 'livekit-server-sdk'
import { createRoomStartedHandler } from '../../../src/logic/livekit-webhook/event-handlers/room-started-handler'
import { ILivekitComponent } from '../../../src/types/livekit.type'
import { ISceneBanManager } from '../../../src/types'
import { IPlacesComponent } from '../../../src/types/places.type'
import { IFetchComponent } from '@well-known-components/interfaces'
import { IConfigComponent } from '@well-known-components/interfaces'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createPlacesMockedComponent, createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'
import { createSceneBanManagerMockedComponent } from '../../mocks/scene-ban-manager-mock'
import { createFetchMockedComponent } from '../../mocks/fetch-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'

// Mock dcl-catalyst-client
jest.mock('dcl-catalyst-client', () => ({
  createContentClient: jest.fn(() => ({
    fetchEntityById: jest.fn()
  }))
}))

describe('Room Started Handler', () => {
  let handler: Awaited<ReturnType<typeof createRoomStartedHandler>>
  let livekit: jest.Mocked<ILivekitComponent>
  let sceneBanManager: jest.Mocked<ISceneBanManager>
  let places: jest.Mocked<IPlacesComponent>
  let fetch: jest.Mocked<IFetchComponent>
  let config: jest.Mocked<IConfigComponent>
  let getSceneRoomMetadataFromRoomNameMock: jest.MockedFunction<ILivekitComponent['getSceneRoomMetadataFromRoomName']>
  let getPlaceByWorldNameMock: jest.MockedFunction<IPlacesComponent['getPlaceByWorldName']>
  let getPlaceByParcelMock: jest.MockedFunction<IPlacesComponent['getPlaceByParcel']>
  let listBannedAddressesMock: jest.MockedFunction<ISceneBanManager['listBannedAddresses']>
  let updateRoomMetadataMock: jest.MockedFunction<ILivekitComponent['updateRoomMetadata']>
  let fetchEntityByIdMock: jest.MockedFunction<any>

  beforeEach(async () => {
    getSceneRoomMetadataFromRoomNameMock = jest.fn()
    getPlaceByWorldNameMock = jest.fn()
    getPlaceByParcelMock = jest.fn()
    listBannedAddressesMock = jest.fn()
    updateRoomMetadataMock = jest.fn()
    fetchEntityByIdMock = jest.fn()

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

    fetch = createFetchMockedComponent()

    config = createConfigMockedComponent({
      requireString: jest.fn().mockResolvedValue('https://catalyst.example.com')
    })

    // Mock the catalyst client
    const { createContentClient } = require('dcl-catalyst-client')
    const mockCatalyst = {
      fetchEntityById: fetchEntityByIdMock
    }
    createContentClient.mockReturnValue(mockCatalyst)

    handler = await createRoomStartedHandler({
      livekit,
      sceneBanManager,
      places,
      fetch,
      config
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
          expect(fetchEntityByIdMock).not.toHaveBeenCalled()
          expect(listBannedAddressesMock).toHaveBeenCalledWith('world-place-id')
          expect(updateRoomMetadataMock).toHaveBeenCalledWith(webhookEvent.room!.name, {
            bannedAddresses: ['0x123', '0x456']
          })
        })

        describe('and getting place by world name fails', () => {
          beforeEach(() => {
            getPlaceByWorldNameMock.mockRejectedValue(new Error('World not found'))
          })

          it('should propagate the error', async () => {
            await expect(handler.handle(webhookEvent)).rejects.toThrow('World not found')

            expect(getPlaceByWorldNameMock).toHaveBeenCalledWith('test-world')
            expect(listBannedAddressesMock).not.toHaveBeenCalled()
            expect(updateRoomMetadataMock).not.toHaveBeenCalled()
          })
        })

        describe('and getting banned addresses fails', () => {
          beforeEach(() => {
            listBannedAddressesMock.mockRejectedValue(new Error('Database error'))
          })

          it('should propagate the error', async () => {
            await expect(handler.handle(webhookEvent)).rejects.toThrow('Database error')

            expect(listBannedAddressesMock).toHaveBeenCalledWith('world-place-id')
            expect(updateRoomMetadataMock).not.toHaveBeenCalled()
          })
        })

        describe('and updating room metadata fails', () => {
          beforeEach(() => {
            updateRoomMetadataMock.mockRejectedValue(new Error('LiveKit error'))
          })

          it('should propagate the error', async () => {
            await expect(handler.handle(webhookEvent)).rejects.toThrow('LiveKit error')

            expect(updateRoomMetadataMock).toHaveBeenCalledWith(webhookEvent.room!.name, {
              bannedAddresses: ['0x123', '0x456']
            })
          })
        })
      })

      describe('and room is a scene room', () => {
        let scenePlace: any
        let mockEntity: any

        beforeEach(() => {
          scenePlace = createMockedPlace({ id: 'scene-place-id' })
          mockEntity = {
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
          fetchEntityByIdMock.mockResolvedValue(mockEntity)
          getPlaceByParcelMock.mockResolvedValue(scenePlace)
          listBannedAddressesMock.mockResolvedValue(['0x789', '0xabc'])
        })

        it('should fetch entity, get place by parcel and update room metadata with banned addresses', async () => {
          await handler.handle(webhookEvent)

          expect(getSceneRoomMetadataFromRoomNameMock).toHaveBeenCalledWith(webhookEvent.room!.name)
          expect(fetchEntityByIdMock).toHaveBeenCalledWith('scene-id-123')
          expect(getPlaceByParcelMock).toHaveBeenCalledWith('-10,-10')
          expect(getPlaceByWorldNameMock).not.toHaveBeenCalled()
          expect(listBannedAddressesMock).toHaveBeenCalledWith('scene-place-id')
          expect(updateRoomMetadataMock).toHaveBeenCalledWith(webhookEvent.room!.name, {
            bannedAddresses: ['0x789', '0xabc']
          })
        })

        describe('and fetching entity fails', () => {
          beforeEach(() => {
            fetchEntityByIdMock.mockRejectedValue(new Error('Catalyst error'))
          })

          it('should propagate the error', async () => {
            await expect(handler.handle(webhookEvent)).rejects.toThrow('Catalyst error')

            expect(fetchEntityByIdMock).toHaveBeenCalledWith('scene-id-123')
            expect(getPlaceByParcelMock).not.toHaveBeenCalled()
            expect(listBannedAddressesMock).not.toHaveBeenCalled()
            expect(updateRoomMetadataMock).not.toHaveBeenCalled()
          })
        })

        describe('and getting place by parcel fails', () => {
          beforeEach(() => {
            getPlaceByParcelMock.mockRejectedValue(new Error('Place not found'))
          })

          it('should propagate the error', async () => {
            await expect(handler.handle(webhookEvent)).rejects.toThrow('Place not found')

            expect(getPlaceByParcelMock).toHaveBeenCalledWith('-10,-10')
            expect(listBannedAddressesMock).not.toHaveBeenCalled()
            expect(updateRoomMetadataMock).not.toHaveBeenCalled()
          })
        })

        describe('and getting banned addresses fails', () => {
          beforeEach(() => {
            listBannedAddressesMock.mockRejectedValue(new Error('Database error'))
          })

          it('should propagate the error', async () => {
            await expect(handler.handle(webhookEvent)).rejects.toThrow('Database error')

            expect(listBannedAddressesMock).toHaveBeenCalledWith('scene-place-id')
            expect(updateRoomMetadataMock).not.toHaveBeenCalled()
          })
        })

        describe('and updating room metadata fails', () => {
          beforeEach(() => {
            updateRoomMetadataMock.mockRejectedValue(new Error('LiveKit error'))
          })

          it('should propagate the error', async () => {
            await expect(handler.handle(webhookEvent)).rejects.toThrow('LiveKit error')

            expect(updateRoomMetadataMock).toHaveBeenCalledWith(webhookEvent.room!.name, {
              bannedAddresses: ['0x789', '0xabc']
            })
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
    })
  })
})
