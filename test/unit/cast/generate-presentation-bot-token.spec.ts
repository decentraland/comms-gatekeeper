import { createCastComponent } from '../../../src/logic/cast/cast'
import { ICastComponent } from '../../../src/logic/cast/types'
import { UnauthorizedError } from '../../../src/types/errors'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createSceneManagerMockedComponent } from '../../mocks/scene-manager-mock'
import { createPlacesMockedComponent } from '../../mocks/places-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'

describe('when generating a presentation bot token', () => {
  let castComponent: ICastComponent
  let mockLivekit: ReturnType<typeof createLivekitMockedComponent>
  let mockLogs: ReturnType<typeof createLoggerMockedComponent>
  let mockSceneStreamAccessManager: ReturnType<typeof createSceneStreamAccessManagerMockedComponent>

  beforeEach(() => {
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
      generateCredentials: jest.fn().mockResolvedValue({
        url: 'wss://test-livekit-url',
        token: 'test-bot-token'
      })
    })

    mockLogs = createLoggerMockedComponent()

    mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
      getAccessByStreamingKey: jest.fn().mockResolvedValue(validStreamAccess)
    })

    castComponent = createCastComponent({
      livekit: mockLivekit,
      logs: mockLogs,
      sceneStreamAccessManager: mockSceneStreamAccessManager,
      sceneManager: createSceneManagerMockedComponent(),
      places: createPlacesMockedComponent(),
      config: createConfigMockedComponent()
    })
  })

  describe('and the streaming key is valid', () => {
    it('should generate LiveKit credentials with publish-only permissions and presentation role', async () => {
      await castComponent.generatePresentationBotToken('valid-stream-key')

      expect(mockLivekit.generateCredentials).toHaveBeenCalledWith(
        expect.stringMatching(/^presentation-bot:scene-test-realm:bafkreiscene123:\d+$/),
        'scene-test-realm:bafkreiscene123',
        expect.objectContaining({
          canPublish: true,
          canSubscribe: true
        }),
        false,
        expect.objectContaining({
          role: 'presentation'
        })
      )
    })

    it('should include the bot identity in the cast permissions array', async () => {
      await castComponent.generatePresentationBotToken('valid-stream-key')

      const callArgs = mockLivekit.generateCredentials.mock.calls[0]
      const botIdentity = callArgs[0]
      const permissions = callArgs[2]
      expect(permissions.cast).toEqual([botIdentity])
    })

    it('should return the LiveKit url, token, and roomId', async () => {
      const result = await castComponent.generatePresentationBotToken('valid-stream-key')

      expect(result.url).toBe('wss://test-livekit-url')
      expect(result.token).toBe('test-bot-token')
      expect(result.roomId).toBe('scene-test-realm:bafkreiscene123')
    })

    it('should not include identity in the result', async () => {
      const result = await castComponent.generatePresentationBotToken('valid-stream-key')

      expect(result).not.toHaveProperty('identity')
    })
  })

  describe('and the streaming key is invalid', () => {
    beforeEach(() => {
      mockSceneStreamAccessManager.getAccessByStreamingKey.mockResolvedValue(null)
    })

    it('should throw an UnauthorizedError', async () => {
      await expect(castComponent.generatePresentationBotToken('invalid-key')).rejects.toThrow(UnauthorizedError)
    })
  })

  describe('and the streaming key has expired', () => {
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
      await expect(castComponent.generatePresentationBotToken('expired-key')).rejects.toThrow(UnauthorizedError)
    })
  })
})
