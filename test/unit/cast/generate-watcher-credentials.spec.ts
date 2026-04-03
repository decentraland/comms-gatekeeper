import { createCastComponent } from '../../../src/logic/cast/cast'
import { ICastComponent } from '../../../src/logic/cast/types'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createSceneManagerMockedComponent } from '../../mocks/scene-manager-mock'
import { createPlacesMockedComponent, createMockedWorldPlace } from '../../mocks/places-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'

describe('when generating watcher credentials', () => {
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
      getLatestAccessByPlaceId: jest.fn().mockResolvedValue(null)
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

  describe('and the room id is provided', () => {
    const roomId = 'scene-test-realm:bafkreiscene123'
    const identity = 'watcher-display-name'

    it('should generate LiveKit credentials with the room id, watch-only permissions, and watcher role', async () => {
      await castComponent.generateWatcherCredentials(roomId, identity)

      expect(mockLivekit.generateCredentials).toHaveBeenCalledWith(
        expect.any(String),
        roomId,
        expect.objectContaining({
          canPublish: false,
          canSubscribe: true,
          cast: []
        }),
        false,
        expect.objectContaining({
          role: 'watcher',
          displayName: identity
        })
      )
    })

    it('should return the LiveKit credentials and room information', async () => {
      const result = await castComponent.generateWatcherCredentials(roomId, identity)

      expect(result.url).toBe('wss://test-livekit-url')
      expect(result.token).toBe('test-token')
      expect(result.roomId).toBe(roomId)
      expect(result.identity).toMatch(/^watch:scene-test-realm:bafkreiscene123:\d+$/)
    })
  })

  describe('and the identity contains special characters', () => {
    const roomId = 'scene-test-realm:bafkreiscene123'
    const specialIdentity = 'User With Spaces & Special Chars!'

    it('should pass the identity to the metadata', async () => {
      await castComponent.generateWatcherCredentials(roomId, specialIdentity)

      expect(mockLivekit.generateCredentials).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(Boolean),
        expect.objectContaining({
          displayName: specialIdentity
        })
      )
    })
  })
})
