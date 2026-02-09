import { createCastComponent } from '../../../src/logic/cast/cast'
import { ICastComponent } from '../../../src/logic/cast/types'
import { UnauthorizedError } from '../../../src/types/errors'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createSceneManagerMockedComponent } from '../../mocks/scene-manager-mock'
import { createPlacesMockedComponent, createMockedWorldPlace } from '../../mocks/places-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'

describe('when validating a streamer token', () => {
  let castComponent: ICastComponent
  let mockLivekit: ReturnType<typeof createLivekitMockedComponent>
  let mockLogs: ReturnType<typeof createLoggerMockedComponent>
  let mockSceneStreamAccessManager: ReturnType<typeof createSceneStreamAccessManagerMockedComponent>
  let mockSceneManager: ReturnType<typeof createSceneManagerMockedComponent>
  let mockPlaces: ReturnType<typeof createPlacesMockedComponent>
  let mockConfig: ReturnType<typeof createConfigMockedComponent>

  beforeEach(() => {
    const mockWorldPlace = createMockedWorldPlace({
      id: 'world-place-123',
      title: 'Test World Place',
      owner: '0xowner123',
      world_name: 'test-world.dcl.eth'
    })

    const validStreamAccess = {
      id: 'access-123',
      place_id: 'world-place-123',
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
      getLatestAccessByPlaceId: jest.fn().mockResolvedValue(null),
      getAccessByStreamingKey: jest.fn().mockResolvedValue(validStreamAccess)
    })

    mockSceneManager = createSceneManagerMockedComponent({
      isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(true)
    })

    mockPlaces = createPlacesMockedComponent({
      getWorldScenePlace: jest.fn().mockResolvedValue(mockWorldPlace),
      getWorldByName: jest.fn().mockResolvedValue(mockWorldPlace)
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

  describe('and the streaming key is valid', () => {
    it('should generate LiveKit credentials with the room id, publish permissions, and streamer role', async () => {
      await castComponent.validateStreamerToken('valid-stream-key', 'streamer-identity')

      expect(mockLivekit.generateCredentials).toHaveBeenCalledWith(
        expect.any(String),
        'scene-test-realm:bafkreiscene123',
        expect.objectContaining({
          canPublish: true,
          canSubscribe: true
        }),
        false,
        expect.objectContaining({
          role: 'streamer',
          displayName: 'streamer-identity'
        })
      )
    })

    it('should return the LiveKit credentials and room information', async () => {
      const result = await castComponent.validateStreamerToken('valid-stream-key', 'streamer-identity')

      expect(result.url).toBe('wss://test-livekit-url')
      expect(result.token).toBe('test-token')
      expect(result.roomId).toBe('scene-test-realm:bafkreiscene123')
      expect(result.identity).toMatch(/^stream:world-place-123:\d+$/)
    })
  })

  describe('and the streaming key is invalid', () => {
    beforeEach(() => {
      mockSceneStreamAccessManager.getAccessByStreamingKey.mockResolvedValue(null)
    })

    it('should throw an UnauthorizedError', async () => {
      await expect(castComponent.validateStreamerToken('invalid-key', 'streamer-identity')).rejects.toThrow(
        UnauthorizedError
      )
    })
  })

  describe('and the streaming token has expired', () => {
    beforeEach(() => {
      const expiredStreamAccess = {
        id: 'access-123',
        place_id: 'world-place-123',
        streaming_key: 'expired-stream-key',
        streaming_url: 'rtmp://test-url',
        ingress_id: 'test-ingress-id',
        created_at: Date.now(),
        active: true,
        streaming: false,
        streaming_start_time: 0,
        room_id: 'scene-test-realm:bafkreiscene123',
        expiration_time: String(Date.now() - 1000)
      }

      mockSceneStreamAccessManager.getAccessByStreamingKey.mockResolvedValue(expiredStreamAccess)
    })

    it('should throw an UnauthorizedError', async () => {
      await expect(castComponent.validateStreamerToken('expired-key', 'streamer-identity')).rejects.toThrow(
        UnauthorizedError
      )
    })
  })
})
