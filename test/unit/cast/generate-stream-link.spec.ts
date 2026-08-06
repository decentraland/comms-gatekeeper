import { createCastComponent } from '../../../src/logic/cast/cast'
import { ICastComponent } from '../../../src/logic/cast/types'
import { NotSceneAdminError } from '../../../src/logic/cast/errors'
import { ForbiddenError } from '../../../src/types/errors'
import { PlaceAttributes } from '../../../src/types/places.type'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createSceneManagerMockedComponent } from '../../mocks/scene-manager-mock'
import { createPlacesMockedComponent, createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'
import { createSceneBanManagerMockedComponent } from '../../mocks/scene-ban-manager-mock'
import { createUserModerationMockedComponent } from '../../mocks/user-moderation-mock'
import { makeBan } from '../user-moderation/utils'

describe('when generating a stream link', () => {
  let castComponent: ICastComponent
  let mockLivekit: ReturnType<typeof createLivekitMockedComponent>
  let mockLogs: ReturnType<typeof createLoggerMockedComponent>
  let mockSceneStreamAccessManager: ReturnType<typeof createSceneStreamAccessManagerMockedComponent>
  let mockSceneManager: ReturnType<typeof createSceneManagerMockedComponent>
  let mockPlaces: ReturnType<typeof createPlacesMockedComponent>
  let mockConfig: ReturnType<typeof createConfigMockedComponent>
  let mockSceneBanManager: ReturnType<typeof createSceneBanManagerMockedComponent>
  let mockUserModeration: ReturnType<typeof createUserModerationMockedComponent>
  let mockPlace: PlaceAttributes
  let mockWorldScenePlace: PlaceAttributes

  beforeEach(() => {
    mockPlace = createMockedPlace({
      id: 'place-123',
      title: 'Test Place',
      owner: '0xowner123',
      positions: ['10,20']
    })

    mockWorldScenePlace = createMockedWorldPlace({
      id: 'world-scene-place-456',
      title: 'Test World Scene Place',
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

    // The place is resolved from the sceneId via places.getPlaceBySceneId, which internally uses
    // the content entity's base parcel (genesis) or the world content server (worlds). The cast
    // component only calls getPlaceBySceneId, so stub that; it defaults to the genesis place.
    mockPlaces = createPlacesMockedComponent({
      getPlaceBySceneId: jest.fn().mockResolvedValue(mockPlace),
      getPlaceByParcel: jest.fn().mockResolvedValue(mockPlace)
    })

    mockConfig = createConfigMockedComponent({
      getString: jest.fn().mockResolvedValue('https://cast2.decentraland.org')
    })

    mockSceneBanManager = createSceneBanManagerMockedComponent({
      isBanned: jest.fn().mockResolvedValue(false)
    })

    mockUserModeration = createUserModerationMockedComponent()

    castComponent = createCastComponent({
      livekit: mockLivekit,
      logs: mockLogs,
      sceneStreamAccessManager: mockSceneStreamAccessManager,
      sceneManager: mockSceneManager,
      places: mockPlaces,
      config: mockConfig,
      sceneBanManager: mockSceneBanManager,
      userModeration: mockUserModeration
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
        sceneId: 'bafkreiscene123',
        realmName: 'test-realm'
      })

      expect(mockLivekit.getSceneRoomName).toHaveBeenCalledWith('test-realm', 'bafkreiscene123')
    })

    it('should return the place id from the parcel lookup', async () => {
      const result = await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        sceneId: 'bafkreiscene123',
        realmName: 'test-realm'
      })

      expect(result.placeId).toBe('place-123')
    })

    it('should create a new stream access entry', async () => {
      await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
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
      mockPlaces.getPlaceBySceneId.mockResolvedValue(mockWorldScenePlace)
    })

    it('should get the world scene room with the scene id', async () => {
      await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        worldName: 'test-world.dcl.eth',
        sceneId: 'bafkreiscene123',
        realmName: 'test-world.dcl.eth'
      })

      expect(mockLivekit.getWorldSceneRoomName).toHaveBeenCalledWith('test-world.dcl.eth', 'bafkreiscene123')
    })

    it('should resolve the world scene place from the world name and scene id', async () => {
      await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        worldName: 'test-world.dcl.eth',
        sceneId: 'bafkreiscene123',
        realmName: 'test-world.dcl.eth'
      })

      expect(mockPlaces.getPlaceBySceneId).toHaveBeenCalledWith('bafkreiscene123', 'test-world.dcl.eth')
    })

    it('should check admin permissions using the world scene place', async () => {
      await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        worldName: 'test-world.dcl.eth',
        sceneId: 'bafkreiscene123',
        realmName: 'test-world.dcl.eth'
      })

      expect(mockSceneManager.isSceneOwnerOrAdmin).toHaveBeenCalledWith(mockWorldScenePlace, '0xowner123')
    })

    it('should return the world scene place id', async () => {
      const result = await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        worldName: 'test-world.dcl.eth',
        sceneId: 'bafkreiscene123',
        realmName: 'test-world.dcl.eth'
      })

      expect(result.placeId).toBe('world-scene-place-456')
    })
  })

  describe('and the user is not an admin', () => {
    beforeEach(() => {
      mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)
      mockPlaces.getPlaceBySceneId.mockResolvedValue(mockWorldScenePlace)
    })

    it('should throw a NotSceneAdminError', async () => {
      await expect(
        castComponent.generateStreamLink({
          walletAddress: '0xrandomuser',
          worldName: 'test-world.dcl.eth',
          sceneId: 'bafkreiscene123',
          realmName: 'test-world.dcl.eth'
        })
      ).rejects.toThrow(NotSceneAdminError)
    })
  })

  describe('and there is an existing active stream access', () => {
    describe('and the access can be reused', () => {
      beforeEach(() => {
        const existingAccess = {
          id: 'access-123',
          place_id: 'world-scene-place-456',
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
          place_id: 'world-scene-place-456',
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
          place_id: 'world-scene-place-456',
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
      mockPlaces.getPlaceBySceneId.mockResolvedValue(mockWorldScenePlace)
    })

    it('should return the stream link details with place name and expiration information', async () => {
      const result = await castComponent.generateStreamLink({
        walletAddress: '0xowner123',
        worldName: 'test-world.dcl.eth',
        sceneId: 'bafkreiscene123',
        realmName: 'test-world.dcl.eth'
      })

      expect(result.streamLink).toBe('https://cast2.decentraland.org/s/test-stream-key')
      expect(result.watcherLink).toBe('https://cast2.decentraland.org/w/test-world.dcl.eth')
      expect(result.placeName).toBe('Test World Scene Place')
      expect(result.expiresAt).toBeDefined()
      expect(result.expiresInDays).toBeGreaterThan(0)
    })
  })

  describe('and the caller has an active platform ban', () => {
    let bannedAddress: string
    let params: { walletAddress: string; sceneId: string; realmName: string }

    beforeEach(() => {
      bannedAddress = '0xbanned00000000000000000000000000000000ad'
      params = { walletAddress: bannedAddress, sceneId: 'bafkreiscene123', realmName: 'test-realm' }
      mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
      mockUserModeration.getActiveBanForConnection.mockResolvedValue({
        isBanned: true,
        ban: makeBan({ bannedAddress })
      })
    })

    it('should throw a ForbiddenError stating the user is platform-banned', async () => {
      await expect(castComponent.generateStreamLink(params)).rejects.toThrow(
        new ForbiddenError('Access denied, platform-banned user')
      )
    })

    it('should not create any stream access', async () => {
      await expect(castComponent.generateStreamLink(params)).rejects.toThrow(ForbiddenError)

      expect(mockSceneStreamAccessManager.addAccess).not.toHaveBeenCalled()
    })

    it('should not create a LiveKit ingress', async () => {
      await expect(castComponent.generateStreamLink(params)).rejects.toThrow(ForbiddenError)

      expect(mockLivekit.getOrCreateIngress).not.toHaveBeenCalled()
    })

    it('should reject before checking scene admin permissions, so the error never reveals admin status', async () => {
      await expect(castComponent.generateStreamLink(params)).rejects.toThrow(ForbiddenError)

      expect(mockSceneManager.isSceneOwnerOrAdmin).not.toHaveBeenCalled()
    })
  })

  // Separate branch from generateStreamLink, with its own ban assertion and no admin check.
  describe('and the caller generates a local preview stream link', () => {
    let params: { sceneId: string; realmName: string; walletAddress: string }

    describe('and the caller has an active platform ban', () => {
      let bannedAddress: string

      beforeEach(() => {
        bannedAddress = '0xbanned00000000000000000000000000000000ad'
        params = { sceneId: 'bafkreiscene123', realmName: 'preview', walletAddress: bannedAddress }
        mockUserModeration.getActiveBanForConnection.mockResolvedValue({
          isBanned: true,
          ban: makeBan({ bannedAddress })
        })
      })

      it('should throw a ForbiddenError stating the user is platform-banned', async () => {
        await expect(castComponent.generatePreviewStreamLink(params)).rejects.toThrow(
          new ForbiddenError('Access denied, platform-banned user')
        )
      })

      it('should not create any stream access', async () => {
        await expect(castComponent.generatePreviewStreamLink(params)).rejects.toThrow(ForbiddenError)

        expect(mockSceneStreamAccessManager.addAccess).not.toHaveBeenCalled()
      })

      it('should not create a LiveKit ingress, so no streaming key is minted', async () => {
        await expect(castComponent.generatePreviewStreamLink(params)).rejects.toThrow(ForbiddenError)

        expect(mockLivekit.getOrCreateIngress).not.toHaveBeenCalled()
      })
    })

    describe('and the caller has no active platform ban', () => {
      beforeEach(() => {
        params = { sceneId: 'bafkreiscene123', realmName: 'preview', walletAddress: '0xowner123' }
        mockUserModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: false })
      })

      it('should generate the preview stream link', async () => {
        const result = await castComponent.generatePreviewStreamLink(params)

        expect(result.streamingKey).toBe('test-stream-key')
      })
    })
  })

  describe('and the request carries a device id another wallet is banned on', () => {
    let params: { walletAddress: string; sceneId: string; realmName: string; deviceIdentifier: string }

    beforeEach(() => {
      params = {
        walletAddress: '0xowner123',
        sceneId: 'bafkreiscene123',
        realmName: 'test-realm',
        deviceIdentifier: 'banned-device'
      }
      mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
      mockUserModeration.getActiveBanForConnection.mockImplementation(async ({ deviceId }) =>
        deviceId === 'banned-device'
          ? { isBanned: true, ban: makeBan({ bannedAddress: '0xsomeone-else', bannedDeviceId: 'banned-device' }) }
          : { isBanned: false }
      )
    })

    it('should pass the request device id to the gate and reject', async () => {
      await expect(castComponent.generateStreamLink(params)).rejects.toThrow(ForbiddenError)

      expect(mockUserModeration.getActiveBanForConnection).toHaveBeenCalledWith({
        address: '0xowner123',
        deviceId: 'banned-device'
      })
    })

    it('should not mint a streaming key', async () => {
      await expect(castComponent.generateStreamLink(params)).rejects.toThrow(ForbiddenError)

      expect(mockSceneStreamAccessManager.addAccess).not.toHaveBeenCalled()
    })

    it('should reject the local preview branch on the same device id', async () => {
      await expect(
        castComponent.generatePreviewStreamLink({
          sceneId: 'bafkreiscene123',
          realmName: 'preview',
          walletAddress: '0xowner123',
          deviceIdentifier: 'banned-device'
        })
      ).rejects.toThrow(ForbiddenError)
    })
  })

  describe('and the caller has a lifted or expired ban only', () => {
    let params: { walletAddress: string; sceneId: string; realmName: string }

    beforeEach(() => {
      params = { walletAddress: '0xowner123', sceneId: 'bafkreiscene123', realmName: 'test-realm' }
      mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
      mockPlaces.getPlaceBySceneId.mockResolvedValue(mockPlace)
      mockUserModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: false })
    })

    it('should generate the stream link', async () => {
      const result = await castComponent.generateStreamLink(params)

      expect(result.streamingKey).toBe('test-stream-key')
    })
  })
})
