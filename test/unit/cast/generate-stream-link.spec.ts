import { createCastComponent } from '../../../src/logic/cast/cast'
import { ICastComponent } from '../../../src/logic/cast/types'
import { UnauthorizedError } from '../../../src/types/errors'
import { PlaceAttributes } from '../../../src/types/places.type'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createSceneManagerMockedComponent } from '../../mocks/scene-manager-mock'
import { createPlacesMockedComponent, createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'

describe('when generating a stream link', () => {
  let castComponent: ICastComponent
  let mockLivekit: ReturnType<typeof createLivekitMockedComponent>
  let mockLogs: ReturnType<typeof createLoggerMockedComponent>
  let mockSceneStreamAccessManager: ReturnType<typeof createSceneStreamAccessManagerMockedComponent>
  let mockSceneManager: ReturnType<typeof createSceneManagerMockedComponent>
  let mockPlaces: ReturnType<typeof createPlacesMockedComponent>
  let mockConfig: ReturnType<typeof createConfigMockedComponent>
  let mockPlace: PlaceAttributes
  let mockWorldPlace: PlaceAttributes

  beforeEach(() => {
    mockPlace = createMockedPlace({
      id: 'place-123',
      title: 'Test Place',
      owner: '0xowner123',
      positions: ['10,20']
    })

    mockWorldPlace = createMockedWorldPlace({
      id: 'world-place-123',
      title: 'Test World Place',
      owner: '0xowner123',
      world_name: 'test-world.dcl.eth'
    })

    mockLivekit = createLivekitMockedComponent({
      getWorldSceneRoomName: jest.fn().mockReturnValue('world-prod-scene-room-test-world.dcl.eth-bafkreiscene123'),
      getSceneRoomName: jest.fn().mockReturnValue('scene-test-realm:bafkreiscene123'),
      getOrCreateIngress: jest.fn().mockResolvedValue({
        url: 'rtmp://test-url',
        streamKey: 'test-stream-key',
        ingressId: 'test-ingress-id'
      }),
      generateCredentials: jest.fn().mockResolvedValue({
        url: 'wss://test-livekit-url',
        token: 'test-token'
      })
    })

    mockLogs = createLoggerMockedComponent()

    mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
      getLatestAccessByPlaceId: jest.fn().mockResolvedValue(null),
      addAccess: jest.fn().mockResolvedValue({
        id: 'access-123',
        place_id: 'place-123',
        streaming_url: 'rtmp://test-url',
        streaming_key: 'test-stream-key',
        ingress_id: 'test-ingress-id',
        room_id: 'scene-test-realm:bafkreiscene123',
        expiration_time: Date.now() + 4 * 24 * 60 * 60 * 1000
      })
    })

    mockSceneManager = createSceneManagerMockedComponent({
      isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(true)
    })

    mockPlaces = createPlacesMockedComponent({
      getWorldScenePlace: jest.fn().mockResolvedValue(mockWorldPlace),
      getWorldByName: jest.fn().mockResolvedValue(mockWorldPlace),
      getPlaceByParcel: jest.fn().mockResolvedValue(mockPlace)
    })

    mockConfig = createConfigMockedComponent({
      getString: jest.fn().mockResolvedValue('https://cast2.decentraland.org')
    })

    castComponent = createCastComponent({
      livekit: mockLivekit,
      logs: mockLogs,
      sceneStreamAccessManager: mockSceneStreamAccessManager,
      sceneManager: mockSceneManager,
      places: mockPlaces,
      config: mockConfig
    })
  })

  describe('and the request is for a parcel', () => {
    beforeEach(() => {
      mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
      mockPlaces.getPlaceByParcel.mockResolvedValue(mockPlace)
    })

    it('should get the scene room name with the realm and scene id', async () => {
      await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        parcel: '10,20',
        sceneId: 'bafkreiscene123',
        realmName: 'test-realm'
      })

      expect(mockLivekit.getSceneRoomName).toHaveBeenCalledWith('test-realm', 'bafkreiscene123')
    })

    it('should return the place id from the parcel lookup', async () => {
      const result = await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        parcel: '10,20',
        sceneId: 'bafkreiscene123',
        realmName: 'test-realm'
      })

      expect(result.placeId).toBe('place-123')
    })

    it('should create a new stream access entry', async () => {
      await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        parcel: '10,20',
        sceneId: 'bafkreiscene123',
        realmName: 'test-realm'
      })

      expect(mockSceneStreamAccessManager.addAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          place_id: 'place-123',
          room_id: 'scene-test-realm:bafkreiscene123',
          generated_by: '0xowner123'
        })
      )
    })
  })

  describe('and the request is for a world', () => {
    beforeEach(() => {
      mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
      mockPlaces.getWorldScenePlace.mockResolvedValue(mockWorldPlace)
    })

    it('should get the world scene room with the scene id', async () => {
      await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        worldName: 'test-world.dcl.eth',
        parcel: '0,0',
        sceneId: 'bafkreiscene123',
        realmName: 'test-world.dcl.eth'
      })

      expect(mockLivekit.getWorldSceneRoomName).toHaveBeenCalledWith('test-world.dcl.eth', 'bafkreiscene123')
    })

    it('should get the world scene place with world name and parcel', async () => {
      await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        worldName: 'test-world.dcl.eth',
        parcel: '0,0',
        sceneId: 'bafkreiscene123',
        realmName: 'test-world.dcl.eth'
      })

      expect(mockPlaces.getWorldScenePlace).toHaveBeenCalledWith('test-world.dcl.eth', '0,0')
    })

    it('should return the world place id', async () => {
      const result = await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        worldName: 'test-world.dcl.eth',
        parcel: '0,0',
        sceneId: 'bafkreiscene123',
        realmName: 'test-world.dcl.eth'
      })

      expect(result.placeId).toBe('world-place-123')
    })
  })

  describe('and the user is not an admin', () => {
    beforeEach(() => {
      mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)
      mockPlaces.getWorldScenePlace.mockResolvedValue(mockWorldPlace)
    })

    it('should throw an UnauthorizedError', async () => {
      await expect(
        castComponent.generateStreamLink({
          walletAddress: '0xrandomuser',
          worldName: 'test-world.dcl.eth',
          parcel: '0,0',
          sceneId: 'bafkreiscene123',
          realmName: 'test-world.dcl.eth'
        })
      ).rejects.toThrow(UnauthorizedError)
    })
  })

  describe('and there is an existing active stream access', () => {
    describe('and the access can be reused', () => {
      beforeEach(() => {
        const existingAccess = {
          id: 'access-123',
          place_id: 'world-place-123',
          streaming_url: 'rtmp://test-url',
          ingress_id: 'test-ingress-id',
          created_at: Date.now(),
          active: true,
          streaming: false,
          streaming_start_time: 0,
          streaming_key: 'existing-stream-key',
          room_id: 'world-prod-scene-room-test-world.dcl.eth-bafkreiscene123',
          expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
        }

        mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(existingAccess)
        mockLivekit.getWorldSceneRoomName.mockReturnValue('world-prod-scene-room-test-world.dcl.eth-bafkreiscene123')
      })

      it('should return the existing streaming key and not create a new stream access entry', async () => {
        const result = await castComponent.generateStreamLink({
          walletAddress: '0xowner123',
          worldName: 'test-world.dcl.eth',
          parcel: '0,0',
          sceneId: 'bafkreiscene123',
          realmName: 'test-world.dcl.eth'
        })

        expect(result.streamingKey).toBe('existing-stream-key')
        expect(mockSceneStreamAccessManager.addAccess).not.toHaveBeenCalled()
      })
    })

    describe('and the access has expired', () => {
      beforeEach(() => {
        const expiredAccess = {
          id: 'access-123',
          place_id: 'world-place-123',
          streaming_url: 'rtmp://test-url',
          ingress_id: 'test-ingress-id',
          created_at: Date.now(),
          active: true,
          streaming: false,
          streaming_start_time: 0,
          streaming_key: 'expired-stream-key',
          room_id: 'world-prod-scene-room-test-world.dcl.eth-bafkreiscene123',
          expiration_time: String(Date.now() - 1000)
        }

        mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(expiredAccess)
        mockLivekit.getWorldSceneRoomName.mockReturnValue('world-prod-scene-room-test-world.dcl.eth-bafkreiscene123')
      })

      it('should create a new stream access entry and return a new streaming key', async () => {
        const result = await castComponent.generateStreamLink({
          walletAddress: '0xowner123',
          worldName: 'test-world.dcl.eth',
          parcel: '0,0',
          sceneId: 'bafkreiscene123',
          realmName: 'test-world.dcl.eth'
        })

        expect(mockSceneStreamAccessManager.addAccess).toHaveBeenCalled()
        expect(result.streamingKey).toBe('test-stream-key')
      })
    })

    describe('and the access is for a different room', () => {
      beforeEach(() => {
        const differentRoomAccess = {
          id: 'access-123',
          place_id: 'world-place-123',
          streaming_url: 'rtmp://test-url',
          ingress_id: 'test-ingress-id',
          created_at: Date.now(),
          active: true,
          streaming: false,
          streaming_start_time: 0,
          streaming_key: 'different-room-key',
          room_id: 'different-room-id',
          expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
        }

        mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(differentRoomAccess)
        mockLivekit.getWorldSceneRoomName.mockReturnValue('world-prod-scene-room-test-world.dcl.eth-bafkreiscene123')
      })

      it('should create a new stream access entry', async () => {
        await castComponent.generateStreamLink({
          walletAddress: '0xowner123',
          worldName: 'test-world.dcl.eth',
          parcel: '0,0',
          sceneId: 'bafkreiscene123',
          realmName: 'test-world.dcl.eth'
        })

        expect(mockSceneStreamAccessManager.addAccess).toHaveBeenCalled()
      })
    })
  })

  describe('and the stream link is successfully generated', () => {
    beforeEach(() => {
      mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
      mockPlaces.getWorldScenePlace.mockResolvedValue(mockWorldPlace)
    })

    it('should return the stream link details with place name and expiration information', async () => {
      const result = await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        worldName: 'test-world.dcl.eth',
        parcel: '0,0',
        sceneId: 'bafkreiscene123',
        realmName: 'test-world.dcl.eth'
      })

      expect(result.streamLink).toBe('https://cast2.decentraland.org/s/test-stream-key')
      expect(result.watcherLink).toBe('https://cast2.decentraland.org/w/test-world.dcl.eth')
      expect(result.placeName).toBe('Test World Place')
      expect(result.expiresAt).toBeDefined()
      expect(result.expiresInDays).toBeGreaterThan(0)
    })
  })
})
