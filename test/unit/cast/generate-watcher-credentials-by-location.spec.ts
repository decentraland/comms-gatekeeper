import { createCastComponent } from '../../../src/logic/cast/cast'
import { ICastComponent } from '../../../src/logic/cast/types'
import { UnauthorizedError } from '../../../src/types/errors'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createSceneManagerMockedComponent } from '../../mocks/scene-manager-mock'
import { createPlacesMockedComponent, createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'
import { PlaceAttributes } from '../../../src/types/places.type'

describe('when generating watcher credentials by location', () => {
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

    const validStreamAccess = {
      id: 'access-123',
      place_id: 'place-123',
      streaming_key: 'valid-stream-key',
      streaming_url: 'rtmp://test-url',
      ingress_id: 'test-ingress-id',
      created_at: Date.now(),
      active: true,
      streaming: false,
      streaming_start_time: 0,
      room_id: 'scene-test-realm:bafkreiscene123',
      expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
    }

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
      getLatestAccessByPlaceId: jest.fn().mockResolvedValue(validStreamAccess)
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

  describe('and the location is a world name', () => {
    const worldLocation = 'test-world.dcl.eth'
    const identity = 'watcher-identity'

    beforeEach(() => {
      const worldStreamAccess = {
        id: 'access-123',
        place_id: 'world-place-123',
        streaming_key: 'valid-stream-key',
        streaming_url: 'rtmp://test-url',
        ingress_id: 'test-ingress-id',
        created_at: Date.now(),
        active: true,
        streaming: false,
        streaming_start_time: 0,
        room_id: 'world-room-id',
        expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
      }

      mockPlaces.getWorldByName.mockResolvedValue(mockWorldPlace)
      mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(worldStreamAccess)
    })

    it('should look up the world by name and stream access by place id', async () => {
      await castComponent.generateWatcherCredentialsByLocation(worldLocation, identity)

      expect(mockPlaces.getWorldByName).toHaveBeenCalledWith(worldLocation)
      expect(mockPlaces.getPlaceByParcel).not.toHaveBeenCalled()
      expect(mockSceneStreamAccessManager.getLatestAccessByPlaceId).toHaveBeenCalledWith('world-place-123')
    })

    it('should return the place name', async () => {
      const result = await castComponent.generateWatcherCredentialsByLocation(worldLocation, identity)

      expect(result.placeName).toBe('Test World Place')
    })
  })

  describe('and the location is a parcel', () => {
    const parcelLocation = '10,20'
    const identity = 'watcher-identity'

    beforeEach(() => {
      const parcelStreamAccess = {
        id: 'access-123',
        place_id: 'place-123',
        streaming_key: 'valid-stream-key',
        streaming_url: 'rtmp://test-url',
        ingress_id: 'test-ingress-id',
        created_at: Date.now(),
        active: true,
        streaming: false,
        streaming_start_time: 0,
        room_id: 'scene-test-realm:bafkreiscene123',
        expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
      }

      mockPlaces.getPlaceByParcel.mockResolvedValue(mockPlace)
      mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(parcelStreamAccess)
    })

    it('should look up the place by parcel and stream access by place id', async () => {
      await castComponent.generateWatcherCredentialsByLocation(parcelLocation, identity)

      expect(mockPlaces.getPlaceByParcel).toHaveBeenCalledWith(parcelLocation)
      expect(mockPlaces.getWorldByName).not.toHaveBeenCalled()
      expect(mockSceneStreamAccessManager.getLatestAccessByPlaceId).toHaveBeenCalledWith('place-123')
    })

    it('should return the place name', async () => {
      const result = await castComponent.generateWatcherCredentialsByLocation(parcelLocation, identity)

      expect(result.placeName).toBe('Test Place')
    })
  })

  describe('and there is no active stream for the location', () => {
    const location = '10,20'
    const identity = 'watcher-identity'

    beforeEach(() => {
      mockPlaces.getPlaceByParcel.mockResolvedValue(mockPlace)
      mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(null)
    })

    it('should throw an UnauthorizedError', async () => {
      await expect(castComponent.generateWatcherCredentialsByLocation(location, identity)).rejects.toThrow(
        UnauthorizedError
      )
    })
  })

  describe('and the stream access has expired', () => {
    const location = '10,20'
    const identity = 'watcher-identity'

    beforeEach(() => {
      const expiredStreamAccess = {
        id: 'access-123',
        place_id: 'place-123',
        streaming_key: 'valid-stream-key',
        streaming_url: 'rtmp://test-url',
        ingress_id: 'test-ingress-id',
        created_at: Date.now(),
        active: true,
        streaming: false,
        streaming_start_time: 0,
        room_id: 'scene-test-realm:bafkreiscene123',
        expiration_time: String(Date.now() - 1000)
      }

      mockPlaces.getPlaceByParcel.mockResolvedValue(mockPlace)
      mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(expiredStreamAccess)
    })

    it('should throw an UnauthorizedError', async () => {
      await expect(castComponent.generateWatcherCredentialsByLocation(location, identity)).rejects.toThrow(
        UnauthorizedError
      )
    })
  })

  describe('and the stream access is valid', () => {
    const location = '10,20'
    const identity = 'watcher-identity'

    beforeEach(() => {
      const validStreamAccess = {
        id: 'access-123',
        place_id: 'place-123',
        streaming_key: 'valid-stream-key',
        streaming_url: 'rtmp://test-url',
        ingress_id: 'test-ingress-id',
        created_at: Date.now(),
        active: true,
        streaming: false,
        streaming_start_time: 0,
        room_id: 'scene-test-realm:bafkreiscene123',
        expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
      }

      mockPlaces.getPlaceByParcel.mockResolvedValue(mockPlace)
      mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(validStreamAccess)
    })

    it('should return the LiveKit credentials and room information', async () => {
      const result = await castComponent.generateWatcherCredentialsByLocation(location, identity)

      expect(result.url).toBe('wss://test-livekit-url')
      expect(result.token).toBe('test-token')
      expect(result.roomId).toBe('scene-test-realm:bafkreiscene123')
      expect(result.identity).toMatch(/^watch:scene-test-realm:bafkreiscene123:\d+$/)
    })
  })

  describe('and the place has no title', () => {
    const worldLocation = 'unnamed-world.dcl.eth'
    const identity = 'watcher-identity'

    beforeEach(() => {
      const placeWithoutTitle = createMockedWorldPlace({
        id: 'place-no-title',
        title: null as unknown as string,
        owner: '0xowner123',
        world_name: 'unnamed-world.dcl.eth'
      })

      const streamAccess = {
        id: 'access-123',
        place_id: 'place-no-title',
        streaming_key: 'valid-stream-key',
        streaming_url: 'rtmp://test-url',
        ingress_id: 'test-ingress-id',
        created_at: Date.now(),
        active: true,
        streaming: false,
        streaming_start_time: 0,
        room_id: 'scene-test-realm:bafkreiscene123',
        expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
      }

      mockPlaces.getWorldByName.mockResolvedValue(placeWithoutTitle)
      mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(streamAccess)
    })

    it('should use the world name as place name', async () => {
      const result = await castComponent.generateWatcherCredentialsByLocation(worldLocation, identity)

      expect(result.placeName).toBe('unnamed-world.dcl.eth')
    })
  })

  describe('and the parcel place has no title', () => {
    const parcelLocation = '50,60'
    const identity = 'watcher-identity'

    beforeEach(() => {
      const placeWithoutTitle = createMockedPlace({
        id: 'place-no-title-parcel',
        title: null as unknown as string,
        owner: '0xowner123',
        positions: ['50,60']
      })

      const streamAccess = {
        id: 'access-123',
        place_id: 'place-no-title-parcel',
        streaming_key: 'valid-stream-key',
        streaming_url: 'rtmp://test-url',
        ingress_id: 'test-ingress-id',
        created_at: Date.now(),
        active: true,
        streaming: false,
        streaming_start_time: 0,
        room_id: 'scene-test-realm:bafkreiscene123',
        expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
      }

      mockPlaces.getPlaceByParcel.mockResolvedValue(placeWithoutTitle)
      mockSceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(streamAccess)
    })

    it('should use the location as place name', async () => {
      const result = await castComponent.generateWatcherCredentialsByLocation(parcelLocation, identity)

      expect(result.placeName).toBe('50,60')
    })
  })
})
