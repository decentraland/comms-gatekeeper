import { ICacheStorageComponent } from '@dcl/core-commons'
import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { RoomType } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createRoomMetadataSyncComponent } from '../../src/logic/room-metadata-sync'
import { IRoomMetadataSyncComponent } from '../../src/logic/room-metadata-sync/types'
import { ISceneBanManager } from '../../src/types'
import { ILivekitComponent } from '../../src/types/livekit.type'
import { IPlacesComponent, PlaceAttributes } from '../../src/types/places.type'
import { IContentClientComponent } from '../../src/types/content-client.type'
import { ISceneAdmins } from '../../src/types/scene.type'
import { ILandLeaseComponent } from '../../src/types/land-lease.type'
import { createLivekitMockedComponent } from '../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createSceneBanManagerMockedComponent } from '../mocks/scene-ban-manager-mock'
import { createMockedPlace, createPlacesMockedComponent } from '../mocks/places-mock'
import { createContentClientMockedComponent } from '../mocks/content-client-mock'
import { createSceneAdminsMockedComponent } from '../mocks/scene-admins-mock'

describe('RoomMetadataSyncComponent', () => {
  let component: IRoomMetadataSyncComponent
  let livekit: jest.Mocked<ILivekitComponent>
  let sceneBanManager: jest.Mocked<ISceneBanManager>
  let sceneAdmins: jest.Mocked<ISceneAdmins>
  let places: jest.Mocked<IPlacesComponent>
  let contentClient: jest.Mocked<IContentClientComponent>
  let landLease: jest.Mocked<ILandLeaseComponent>
  let cache: ICacheStorageComponent
  let logs: jest.Mocked<ILoggerComponent>
  let mockPlace: PlaceAttributes

  beforeEach(() => {
    livekit = createLivekitMockedComponent()
    sceneBanManager = createSceneBanManagerMockedComponent()
    sceneAdmins = createSceneAdminsMockedComponent()
    places = createPlacesMockedComponent()
    contentClient = createContentClientMockedComponent()
    landLease = {
      hasLandLease: jest.fn(),
      getAuthorizations: jest.fn().mockResolvedValue({ authorizations: [] }),
      refreshAuthorizations: jest.fn()
    } as jest.Mocked<ILandLeaseComponent>
    cache = createInMemoryCacheComponent()
    logs = createLoggerMockedComponent()
    mockPlace = createMockedPlace({ id: 'test-place-id' })

    component = createRoomMetadataSyncComponent({
      sceneBanManager,
      sceneAdmins,
      livekit,
      places,
      contentClient,
      landLease,
      cache,
      logs
    })
  })

  describe('when refreshing room metadata for a place', () => {
    describe('and there are bans and admins', () => {
      beforeEach(async () => {
        sceneBanManager.listBannedAddresses.mockResolvedValue(['0xban1', '0xban2'])
        sceneAdmins.getAdminsAndExtraAddresses.mockResolvedValue({
          admins: new Set(),
          extraAddresses: new Set(),
          addresses: new Set(['0xadmin1', '0xadmin2', '0xowner'])
        })
        livekit.updateRoomMetadata.mockResolvedValue(undefined)

        await component.refreshRoomMetadata(mockPlace, 'test-room-name')
      })

      it('should fetch banned addresses, admins, and land-lease holders in parallel', () => {
        expect(sceneBanManager.listBannedAddresses).toHaveBeenCalledWith('test-place-id')
        expect(sceneAdmins.getAdminsAndExtraAddresses).toHaveBeenCalledWith(mockPlace)
        expect(landLease.getAuthorizations).toHaveBeenCalled()
      })

      it('should write both keys to room metadata in a single call', () => {
        expect(livekit.updateRoomMetadata).toHaveBeenCalledTimes(1)
        const [roomName, payload] = livekit.updateRoomMetadata.mock.calls[0]
        expect(roomName).toBe('test-room-name')
        expect(payload.bannedAddresses).toEqual(['0xban1', '0xban2'])
        expect(new Set(payload.sceneAdmins as string[])).toEqual(new Set(['0xadmin1', '0xadmin2', '0xowner']))
      })
    })

    describe('and the place has lease holders whose plots overlap', () => {
      beforeEach(async () => {
        mockPlace = createMockedPlace({ id: 'test-place-id', positions: ['10,20', '11,20'], world: false })
        sceneBanManager.listBannedAddresses.mockResolvedValue([])
        sceneAdmins.getAdminsAndExtraAddresses.mockResolvedValue({
          admins: new Set(),
          extraAddresses: new Set(),
          addresses: new Set(['0xadmin1'])
        })
        landLease.getAuthorizations.mockResolvedValue({
          authorizations: [
            {
              name: 'lease-1',
              desc: '',
              contactInfo: { name: 'tenant' },
              addresses: ['0xLEASE1', '0xLease2'],
              plots: ['10,20']
            },
            {
              name: 'unrelated',
              desc: '',
              contactInfo: { name: 'other' },
              addresses: ['0xunrelated'],
              plots: ['99,99']
            }
          ]
        })
        livekit.updateRoomMetadata.mockResolvedValue(undefined)

        await component.refreshRoomMetadata(mockPlace, 'test-room-name')
      })

      it('should include lowercased lease holders for overlapping plots in sceneAdmins', () => {
        const payload = livekit.updateRoomMetadata.mock.calls[0][1]
        expect(new Set(payload.sceneAdmins as string[])).toEqual(new Set(['0xadmin1', '0xlease1', '0xlease2']))
      })

      it('should not include lease holders whose plots do not overlap with this place', () => {
        const payload = livekit.updateRoomMetadata.mock.calls[0][1]
        expect((payload.sceneAdmins as string[]).includes('0xunrelated')).toBe(false)
      })
    })

    describe('and the place is a world', () => {
      beforeEach(async () => {
        mockPlace = createMockedPlace({ id: 'test-place-id', world: true })
        sceneBanManager.listBannedAddresses.mockResolvedValue([])
        sceneAdmins.getAdminsAndExtraAddresses.mockResolvedValue({
          admins: new Set(),
          extraAddresses: new Set(),
          addresses: new Set()
        })
        livekit.updateRoomMetadata.mockResolvedValue(undefined)

        await component.refreshRoomMetadata(mockPlace, 'test-room-name')
      })

      it('should not query land-lease authorizations (lease only applies to Genesis City)', () => {
        expect(landLease.getAuthorizations).not.toHaveBeenCalled()
      })
    })

    describe('and the land-lease lookup itself fails', () => {
      beforeEach(async () => {
        mockPlace = createMockedPlace({ id: 'test-place-id', world: false, positions: ['10,20'] })
        sceneBanManager.listBannedAddresses.mockResolvedValue(['0xban1'])
        sceneAdmins.getAdminsAndExtraAddresses.mockResolvedValue({
          admins: new Set(),
          extraAddresses: new Set(),
          addresses: new Set(['0xadmin1'])
        })
        landLease.getAuthorizations.mockRejectedValue(new Error('lease service unavailable'))
        livekit.updateRoomMetadata.mockResolvedValue(undefined)

        await component.refreshRoomMetadata(mockPlace, 'test-room-name')
      })

      it('should still write bans and admins to metadata (lease failure is isolated)', () => {
        expect(livekit.updateRoomMetadata).toHaveBeenCalledTimes(1)
        const payload = livekit.updateRoomMetadata.mock.calls[0][1]
        expect(payload.bannedAddresses).toEqual(['0xban1'])
        expect(payload.sceneAdmins).toEqual(['0xadmin1'])
      })
    })

    describe('and the place has no bans or admins', () => {
      beforeEach(async () => {
        sceneBanManager.listBannedAddresses.mockResolvedValue([])
        sceneAdmins.getAdminsAndExtraAddresses.mockResolvedValue({
          admins: new Set(),
          extraAddresses: new Set(),
          addresses: new Set()
        })
        livekit.updateRoomMetadata.mockResolvedValue(undefined)

        await component.refreshRoomMetadata(mockPlace, 'test-room-name')
      })

      it('should write empty arrays for both keys', () => {
        expect(livekit.updateRoomMetadata).toHaveBeenCalledWith('test-room-name', {
          bannedAddresses: [],
          sceneAdmins: []
        })
      })
    })

    describe('and a downstream lookup fails', () => {
      beforeEach(() => {
        sceneBanManager.listBannedAddresses.mockRejectedValue(new Error('boom'))
      })

      it('should swallow the error to avoid breaking the caller', async () => {
        await expect(component.refreshRoomMetadata(mockPlace, 'test-room-name')).resolves.not.toThrow()
        expect(livekit.updateRoomMetadata).not.toHaveBeenCalled()
      })
    })

    describe('and the LiveKit metadata write fails', () => {
      beforeEach(() => {
        sceneBanManager.listBannedAddresses.mockResolvedValue([])
        sceneAdmins.getAdminsAndExtraAddresses.mockResolvedValue({
          admins: new Set(),
          extraAddresses: new Set(),
          addresses: new Set()
        })
        livekit.updateRoomMetadata.mockRejectedValue(new Error('livekit unavailable'))
      })

      it('should not propagate the error', async () => {
        await expect(component.refreshRoomMetadata(mockPlace, 'test-room-name')).resolves.not.toThrow()
      })
    })
  })

  describe('when updating room metadata for a webhook room', () => {
    const mockRoom = { name: 'test-room' } as any

    beforeEach(() => {
      sceneBanManager.listBannedAddresses.mockResolvedValue(['0xban1'])
      sceneAdmins.getAdminsAndExtraAddresses.mockResolvedValue({
        admins: new Set(),
        extraAddresses: new Set(),
        addresses: new Set(['0xadmin1'])
      })
      livekit.updateRoomMetadata.mockResolvedValue(undefined)
    })

    describe('and the room is a scene room', () => {
      beforeEach(async () => {
        livekit.getRoomMetadataFromRoomName.mockReturnValue({
          sceneId: 'scene-id',
          worldName: undefined,
          realmName: 'test-realm',
          roomType: RoomType.SCENE
        })
        contentClient.fetchEntityById.mockResolvedValue({
          id: 'scene-id',
          type: 'scene' as any,
          timestamp: 1,
          version: 'v3',
          pointers: ['-1,-1'],
          content: [],
          metadata: { scene: { base: '-1,-1', parcels: ['-1,-1'] } }
        })
        places.getPlaceByParcel.mockResolvedValue(mockPlace)

        await component.updateRoomMetadataForRoom(mockRoom)
      })

      it('should resolve the place via content client + getPlaceByParcel', () => {
        expect(contentClient.fetchEntityById).toHaveBeenCalledWith('scene-id')
        expect(places.getPlaceByParcel).toHaveBeenCalledWith('-1,-1')
      })

      it('should refresh metadata for the resolved place', () => {
        expect(livekit.updateRoomMetadata).toHaveBeenCalledWith('test-room', {
          bannedAddresses: ['0xban1'],
          sceneAdmins: ['0xadmin1']
        })
      })
    })

    describe('and the room is a world scene room with sceneId', () => {
      beforeEach(async () => {
        livekit.getRoomMetadataFromRoomName.mockReturnValue({
          sceneId: 'scene-id',
          worldName: 'test-world',
          realmName: 'test-realm',
          roomType: RoomType.WORLD
        })
        places.getWorldScenePlaceByEntityId.mockResolvedValue(mockPlace)

        await component.updateRoomMetadataForRoom(mockRoom)
      })

      it('should resolve the place via getWorldScenePlaceByEntityId', () => {
        expect(places.getWorldScenePlaceByEntityId).toHaveBeenCalledWith('test-world', 'scene-id')
      })

      it('should not call the content client', () => {
        expect(contentClient.fetchEntityById).not.toHaveBeenCalled()
      })
    })

    describe('and the room is a legacy world room without sceneId', () => {
      beforeEach(async () => {
        livekit.getRoomMetadataFromRoomName.mockReturnValue({
          sceneId: undefined,
          worldName: 'test-world',
          realmName: 'test-realm',
          roomType: RoomType.WORLD
        })
        places.getWorldByName.mockResolvedValue(mockPlace)

        await component.updateRoomMetadataForRoom(mockRoom)
      })

      it('should fall back to getWorldByName', () => {
        expect(places.getWorldByName).toHaveBeenCalledWith('test-world')
        expect(places.getWorldScenePlaceByEntityId).not.toHaveBeenCalled()
        expect(contentClient.fetchEntityById).not.toHaveBeenCalled()
      })
    })

    describe('and the room type is neither scene nor world', () => {
      beforeEach(async () => {
        livekit.getRoomMetadataFromRoomName.mockReturnValue({
          sceneId: undefined,
          worldName: undefined,
          realmName: 'test-realm',
          roomType: RoomType.UNKNOWN
        })

        await component.updateRoomMetadataForRoom(mockRoom)
      })

      it('should not perform any place lookup or metadata write', () => {
        expect(places.getWorldScenePlace).not.toHaveBeenCalled()
        expect(places.getWorldByName).not.toHaveBeenCalled()
        expect(places.getPlaceByParcel).not.toHaveBeenCalled()
        expect(contentClient.fetchEntityById).not.toHaveBeenCalled()
        expect(livekit.updateRoomMetadata).not.toHaveBeenCalled()
      })
    })

    describe('and the place lookup fails', () => {
      beforeEach(async () => {
        livekit.getRoomMetadataFromRoomName.mockReturnValue({
          sceneId: 'scene-id',
          worldName: 'test-world',
          realmName: 'test-realm',
          roomType: RoomType.WORLD
        })
        places.getWorldScenePlaceByEntityId.mockRejectedValue(new Error('Place not found'))

        await component.updateRoomMetadataForRoom(mockRoom)
      })

      it('should swallow the error and not write metadata', () => {
        expect(livekit.updateRoomMetadata).not.toHaveBeenCalled()
      })
    })

    describe('and the same room is refreshed twice in quick succession', () => {
      beforeEach(async () => {
        livekit.getRoomMetadataFromRoomName.mockReturnValue({
          sceneId: 'scene-id',
          worldName: 'test-world',
          realmName: 'test-realm',
          roomType: RoomType.WORLD
        })
        places.getWorldScenePlaceByEntityId.mockResolvedValue(mockPlace)

        await component.updateRoomMetadataForRoom(mockRoom)
        await component.updateRoomMetadataForRoom(mockRoom)
      })

      it('should only perform one place lookup and one metadata write (cooldown deduplicates)', () => {
        expect(places.getWorldScenePlaceByEntityId).toHaveBeenCalledTimes(1)
        expect(livekit.updateRoomMetadata).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the cooldown entry has expired before the next refresh', () => {
      beforeEach(async () => {
        livekit.getRoomMetadataFromRoomName.mockReturnValue({
          sceneId: 'scene-id',
          worldName: 'test-world',
          realmName: 'test-realm',
          roomType: RoomType.WORLD
        })
        places.getWorldScenePlaceByEntityId.mockResolvedValue(mockPlace)

        await component.updateRoomMetadataForRoom(mockRoom)
        // Simulate the cache TTL expiring by clearing the cooldown entry
        // directly. Avoids relying on jest fake timers, which don't always
        // play well with lru-cache's internal scheduling.
        const keys = await cache.keys()
        for (const key of keys) {
          await cache.remove(key)
        }
        await component.updateRoomMetadataForRoom(mockRoom)
      })

      it('should refresh again', () => {
        expect(livekit.updateRoomMetadata).toHaveBeenCalledTimes(2)
      })
    })

    describe('and refreshes for different rooms run in parallel', () => {
      const otherRoom = { name: 'other-room' } as any

      beforeEach(async () => {
        livekit.getRoomMetadataFromRoomName.mockImplementation((roomName: string) => ({
          sceneId: 'scene-id',
          worldName: 'test-world',
          realmName: 'test-realm',
          roomType: RoomType.WORLD
        }))
        places.getWorldScenePlaceByEntityId.mockResolvedValue(mockPlace)

        await Promise.all([
          component.updateRoomMetadataForRoom(mockRoom),
          component.updateRoomMetadataForRoom(otherRoom)
        ])
      })

      it('should refresh both because the cooldown is per-room', () => {
        expect(livekit.updateRoomMetadata).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('when applying incremental ban updates', () => {
    describe('and addBan is called', () => {
      beforeEach(async () => {
        await component.addBan('test-room', '0xabc')
      })

      it('should append the address to the bannedAddresses metadata field without any DB or external fetches', () => {
        expect(livekit.appendToRoomMetadataArray).toHaveBeenCalledWith('test-room', 'bannedAddresses', '0xabc')
        expect(sceneBanManager.listBannedAddresses).not.toHaveBeenCalled()
        expect(sceneAdmins.getAdminsAndExtraAddresses).not.toHaveBeenCalled()
      })
    })

    describe('and the underlying LiveKit append fails', () => {
      beforeEach(() => {
        livekit.appendToRoomMetadataArray.mockRejectedValue(new Error('livekit unavailable'))
      })

      it('should swallow the error so the caller is not broken', async () => {
        await expect(component.addBan('test-room', '0xabc')).resolves.not.toThrow()
      })
    })

    describe('and removeBan is called', () => {
      beforeEach(async () => {
        await component.removeBan('test-room', '0xabc')
      })

      it('should remove the address from the bannedAddresses metadata field', () => {
        expect(livekit.removeFromRoomMetadataArray).toHaveBeenCalledWith('test-room', 'bannedAddresses', '0xabc')
        expect(sceneBanManager.listBannedAddresses).not.toHaveBeenCalled()
      })
    })

    describe('and the underlying LiveKit remove fails', () => {
      beforeEach(() => {
        livekit.removeFromRoomMetadataArray.mockRejectedValue(new Error('livekit unavailable'))
      })

      it('should swallow the error so the caller is not broken', async () => {
        await expect(component.removeBan('test-room', '0xabc')).resolves.not.toThrow()
      })
    })
  })

  describe('when applying incremental admin updates', () => {
    describe('and addAdmin is called', () => {
      beforeEach(async () => {
        await component.addAdmin('test-room', '0xadmin')
      })

      it('should append the address to the sceneAdmins metadata field without re-fetching admin sources', () => {
        expect(livekit.appendToRoomMetadataArray).toHaveBeenCalledWith('test-room', 'sceneAdmins', '0xadmin')
        expect(sceneAdmins.getAdminsAndExtraAddresses).not.toHaveBeenCalled()
        expect(sceneBanManager.listBannedAddresses).not.toHaveBeenCalled()
      })
    })

    describe('and the underlying LiveKit append fails for an admin', () => {
      beforeEach(() => {
        livekit.appendToRoomMetadataArray.mockRejectedValue(new Error('livekit unavailable'))
      })

      it('should swallow the error so the caller is not broken', async () => {
        await expect(component.addAdmin('test-room', '0xadmin')).resolves.not.toThrow()
      })
    })

    describe('and removeAdmin is called', () => {
      beforeEach(async () => {
        await component.removeAdmin('test-room', '0xadmin')
      })

      it('should remove the address from the sceneAdmins metadata field', () => {
        expect(livekit.removeFromRoomMetadataArray).toHaveBeenCalledWith('test-room', 'sceneAdmins', '0xadmin')
        expect(sceneAdmins.getAdminsAndExtraAddresses).not.toHaveBeenCalled()
      })
    })

    describe('and the underlying LiveKit remove fails', () => {
      beforeEach(() => {
        livekit.removeFromRoomMetadataArray.mockRejectedValue(new Error('livekit unavailable'))
      })

      it('should swallow the error so the caller is not broken', async () => {
        await expect(component.removeAdmin('test-room', '0xadmin')).resolves.not.toThrow()
      })
    })
  })
})
