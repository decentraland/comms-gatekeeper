import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'
import { IngressInfo } from 'livekit-server-sdk'
import { SceneStreamAccess } from '../../../src/types'
import { FOUR_DAYS } from '../../../src/logic/time'

test('PUT /scene-stream-access - resets streaming access for scenes', ({ components, stubComponents }) => {
  const placeId = `place-id-stream-access`
  const placeWorldId = `place-id-world-stream-access`
  let cleanup: TestCleanup

  type Metadata = {
    identity: string
    realm: {
      serverName: string
      hostname: string
      protocol: string
    }
    sceneId: string
    parcel: string
    isWorld: boolean
  }

  let metadataLand: Metadata
  let metadataWorld: Metadata
  let mockIngress: IngressInfo
  let mockSceneStreamAccess: any

  beforeAll(async () => {
    cleanup = new TestCleanup(components.database)
  })

  beforeEach(async () => {
    mockIngress = {
      name: 'mock-ingress',
      url: 'rtmp://mock-stream-url',
      streamKey: 'mock-stream-key',
      ingressId: 'mock-ingress-id'
    } as IngressInfo

    const now = Date.now()
    mockSceneStreamAccess = {
      id: 'mock-access-id',
      place_id: placeId,
      streaming_url: 'rtmp://mock-stream-url',
      streaming_key: 'mock-stream-key',
      ingress_id: 'mock-ingress-id',
      created_at: now,
      expiration_time: now + FOUR_DAYS,
      active: true
    }

    metadataLand = {
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'test-realm',
        hostname: 'https://peer.decentraland.zone',
        protocol: 'https'
      },
      parcel: '10,20',
      sceneId: 'test-scene',
      isWorld: false
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'name.dcl.eth',
        hostname: 'https://worlds-content-server.decentraland.org/',
        protocol: 'https'
      },
      parcel: '20,20',
      sceneId: 'test-scene',
      isWorld: true
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue({
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'test-realm',
        hostname: 'https://peer.decentraland.zone',
        protocol: 'https'
      },
      parcel: '10,20',
      sceneId: 'test-scene',
      isWorld: false
    })

    stubComponents.places.getPlaceByParcel.mockResolvedValue({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)

    stubComponents.places.getWorldScenePlace.mockResolvedValue({
      id: placeWorldId,
      world_name: 'name.dcl.eth',
      owner: owner.authChain[0].payload
    } as PlaceAttributes)

    stubComponents.lands.getLandPermissions.mockResolvedValue({
      owner: true,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
    stubComponents.livekit.getSceneRoomName.mockReturnValue(`test-realm:test-scene`)
    stubComponents.livekit.getWorldRoomName.mockReturnValue(`name.dcl.eth`)
    stubComponents.notifications.sendNotificationType.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 200 with new streaming access when user is land owner', async () => {
    const { localFetch } = components

    const newMockIngress = {
      ...mockIngress,
      name: 'new-mock-ingress',
      url: 'rtmp://new-mock-stream-url',
      streamKey: 'new-mock-stream-key',
      ingressId: 'new-mock-ingress-id'
    } as IngressInfo

    const newMockSceneStreamAccess = {
      ...mockSceneStreamAccess,
      streaming_url: 'rtmp://new-mock-stream-url',
      streaming_key: 'new-mock-stream-key',
      ingress_id: 'new-mock-ingress-id'
    } as SceneStreamAccess

    stubComponents.sceneStreamAccessManager.getAccess.mockResolvedValue(mockSceneStreamAccess)
    stubComponents.livekit.removeIngress.mockResolvedValue(undefined)
    stubComponents.sceneStreamAccessManager.removeAccess.mockResolvedValue(undefined)
    stubComponents.livekit.getOrCreateIngress.mockResolvedValue(newMockIngress)
    stubComponents.sceneStreamAccessManager.addAccess.mockResolvedValue(newMockSceneStreamAccess)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'PUT',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      streaming_url: newMockSceneStreamAccess.streaming_url,
      streaming_key: newMockSceneStreamAccess.streaming_key,
      created_at: newMockSceneStreamAccess.created_at,
      ends_at: Number(newMockSceneStreamAccess.expiration_time)
    })

    expect(stubComponents.sceneStreamAccessManager.getAccess).toHaveBeenCalledWith(placeId)
    expect(stubComponents.livekit.removeIngress).toHaveBeenCalledWith(mockSceneStreamAccess.ingress_id)
    expect(stubComponents.sceneStreamAccessManager.removeAccess).toHaveBeenCalledWith(placeId)
    expect(stubComponents.livekit.getOrCreateIngress).toHaveBeenCalled()
    expect(stubComponents.sceneStreamAccessManager.addAccess).toHaveBeenCalled()
  })

  it('should call addAccess with expiration_time set', async () => {
    const { localFetch } = components

    const newMockIngress = {
      ...mockIngress,
      name: 'new-mock-ingress',
      url: 'rtmp://new-mock-stream-url',
      streamKey: 'new-mock-stream-key',
      ingressId: 'new-mock-ingress-id'
    } as IngressInfo

    const newMockSceneStreamAccess = {
      ...mockSceneStreamAccess,
      streaming_url: 'rtmp://new-mock-stream-url',
      streaming_key: 'new-mock-stream-key',
      ingress_id: 'new-mock-ingress-id'
    } as SceneStreamAccess

    stubComponents.sceneStreamAccessManager.getAccess.mockResolvedValue(mockSceneStreamAccess)
    stubComponents.livekit.removeIngress.mockResolvedValue(undefined)
    stubComponents.sceneStreamAccessManager.removeAccess.mockResolvedValue(undefined)
    stubComponents.livekit.getOrCreateIngress.mockResolvedValue(newMockIngress)
    stubComponents.sceneStreamAccessManager.addAccess.mockResolvedValue(newMockSceneStreamAccess)

    const beforeRequest = Date.now()

    await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'PUT',
        metadata: metadataLand
      },
      owner
    )

    const addAccessCall = stubComponents.sceneStreamAccessManager.addAccess.mock.calls[0]
    const addAccessArg = addAccessCall[0]

    expect(addAccessArg.expiration_time).toBeDefined()
    expect(addAccessArg.expiration_time).toBeGreaterThanOrEqual(beforeRequest + FOUR_DAYS)
  })

  it('returns 200 with new streaming access when user is owner of a world', async () => {
    const { localFetch } = components

    const newMockIngress = {
      ...mockIngress,
      name: 'new-mock-ingress',
      url: 'rtmp://new-mock-stream-url',
      streamKey: 'new-mock-stream-key',
      ingressId: 'new-mock-ingress-id'
    } as IngressInfo

    const newMockSceneStreamAccess = {
      ...mockSceneStreamAccess,
      id: 'new-mock-access-id',
      place_id: placeWorldId,
      streaming_url: 'rtmp://new-mock-stream-url',
      streaming_key: 'new-mock-stream-key',
      ingress_id: 'new-mock-ingress-id'
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce({
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'name.dcl.eth',
        hostname: 'https://worlds-content-server.decentraland.org/',
        protocol: 'https'
      },
      parcel: '20,20',
      sceneId: 'test-scene',
      isWorld: true
    })

    stubComponents.sceneStreamAccessManager.getAccess.mockResolvedValue(mockSceneStreamAccess)
    stubComponents.livekit.removeIngress.mockResolvedValue(undefined)
    stubComponents.sceneStreamAccessManager.removeAccess.mockResolvedValue(undefined)
    stubComponents.livekit.getOrCreateIngress.mockResolvedValue(newMockIngress)
    stubComponents.sceneStreamAccessManager.addAccess.mockResolvedValue(newMockSceneStreamAccess)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'PUT',
        metadata: metadataWorld
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      streaming_url: newMockSceneStreamAccess.streaming_url,
      streaming_key: newMockSceneStreamAccess.streaming_key,
      created_at: newMockSceneStreamAccess.created_at,
      ends_at: Number(newMockSceneStreamAccess.expiration_time)
    })

    expect(stubComponents.sceneStreamAccessManager.getAccess).toHaveBeenCalledWith(placeWorldId)
    expect(stubComponents.livekit.removeIngress).toHaveBeenCalledWith(mockSceneStreamAccess.ingress_id)
    expect(stubComponents.sceneStreamAccessManager.removeAccess).toHaveBeenCalledWith(placeWorldId)
    expect(stubComponents.livekit.getOrCreateIngress).toHaveBeenCalled()
    expect(stubComponents.sceneStreamAccessManager.addAccess).toHaveBeenCalled()
  })

  it('returns 401 when user is not the land owner', async () => {
    const { localFetch } = components
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'PUT',
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 when authentication is missing', async () => {
    const { localFetch } = components
    const response = await localFetch.fetch('/scene-stream-access', {
      method: 'PUT'
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when sceneId is missing', async () => {
    const { localFetch } = components
    const metadataWithoutSceneId = {
      ...metadataLand,
      sceneId: undefined
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce({
      ...metadataWithoutSceneId,
      sceneId: undefined
    })

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'PUT',
        metadata: metadataWithoutSceneId
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  describe('when world has sceneId', () => {
    const sceneId = 'bafkreiworldscene123'
    let newMockIngress: IngressInfo
    let newMockSceneStreamAccess: typeof mockSceneStreamAccess

    beforeEach(() => {
      const metadataWorldWithSceneId = {
        ...metadataWorld,
        sceneId
      }

      newMockIngress = {
        ...mockIngress,
        name: 'new-mock-ingress',
        url: 'rtmp://new-mock-stream-url',
        streamKey: 'new-mock-stream-key',
        ingressId: 'new-mock-ingress-id'
      } as IngressInfo

      newMockSceneStreamAccess = {
        ...mockSceneStreamAccess,
        id: 'new-mock-access-id',
        place_id: placeWorldId,
        streaming_url: 'rtmp://new-mock-stream-url',
        streaming_key: 'new-mock-stream-key',
        ingress_id: 'new-mock-ingress-id'
      }

      jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorldWithSceneId)
      stubComponents.livekit.getWorldSceneRoomName.mockReturnValue(`world-prod-scene-room-name.dcl.eth-${sceneId}`)
      stubComponents.sceneStreamAccessManager.getAccess.mockResolvedValue(mockSceneStreamAccess)
      stubComponents.livekit.removeIngress.mockResolvedValue(undefined)
      stubComponents.sceneStreamAccessManager.removeAccess.mockResolvedValue(undefined)
      stubComponents.livekit.getOrCreateIngress.mockResolvedValue(newMockIngress)
      stubComponents.sceneStreamAccessManager.addAccess.mockResolvedValue(newMockSceneStreamAccess)
    })

    it('should get the world scene room with the scene id', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-stream-access',
        {
          method: 'PUT',
          metadata: { ...metadataWorld, sceneId }
        },
        owner
      )

      expect(response.status).toBe(200)
      expect(stubComponents.livekit.getWorldSceneRoomName).toHaveBeenCalledWith('name.dcl.eth', sceneId)
    })
  })

  describe('when world does not have sceneId', () => {
    beforeEach(() => {
      const metadataWorldWithoutSceneId = {
        ...metadataWorld,
        sceneId: undefined
      }

      jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorldWithoutSceneId)
    })

    it('should return 400 error', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-stream-access',
        {
          method: 'PUT',
          metadata: { ...metadataWorld, sceneId: undefined }
        },
        owner
      )

      expect(response.status).toBe(400)
    })
  })

  // No player_connection_info row for this wallet: the match can only come from the device id on
  // the request itself.
  describe('when the reset request carries a device identifier another wallet is banned on', () => {
    const bannedBy = '0x0000000000000000000000000000000000000099'

    beforeEach(async () => {
      jest
        .spyOn(handlersUtils, 'validate')
        .mockResolvedValue({ ...metadataLand, deviceIdentifier: 'banned-device' } as any)
      await components.userModerationDb.createBan({
        bannedAddress: '0x0000000000000000000000000000000000000001',
        bannedBy,
        reason: 'Evasion',
        bannedDeviceId: 'banned-device'
      })
    })

    afterEach(async () => {
      await components.database.query('DELETE FROM user_bans')
      await components.database.query('DELETE FROM player_connection_info')
    })

    it('should respond with a 403 for a wallet with no ban and no recorded connection', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/scene-stream-access',
        { method: 'PUT', metadata: metadataLand },
        owner
      )

      expect(response.status).toBe(403)
    })

    it('should not mint a replacement key', async () => {
      await makeRequest(components.localFetch, '/scene-stream-access', { method: 'PUT', metadata: metadataLand }, owner)

      expect(stubComponents.sceneStreamAccessManager.addAccess).not.toHaveBeenCalled()
    })
  })

  // A reset mints a fresh key, so it has to be gated like the initial request.
  describe('when the requesting admin has an active platform ban', () => {
    const bannedBy = '0x0000000000000000000000000000000000000099'

    beforeEach(async () => {
      await components.userModerationDb.createBan({
        bannedAddress: owner.authChain[0].payload.toLowerCase(),
        bannedBy,
        reason: 'Harassment'
      })
    })

    afterEach(async () => {
      await components.database.query('DELETE FROM user_bans')
      await components.database.query('DELETE FROM player_connection_info')
    })

    // The handler wraps its body in a catch that turns anything but UnauthorizedError into a 500,
    // so this also pins that the rejection is raised outside it.
    it('should respond with a 403 and not a 500', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/scene-stream-access',
        { method: 'PUT', metadata: metadataLand },
        owner
      )
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body).toEqual({ error: 'Access denied, platform-banned user' })
    })

    it('should not remove the existing ingress or mint a new one', async () => {
      await makeRequest(components.localFetch, '/scene-stream-access', { method: 'PUT', metadata: metadataLand }, owner)

      expect(stubComponents.livekit.removeIngress).not.toHaveBeenCalled()
      expect(stubComponents.livekit.getOrCreateIngress).not.toHaveBeenCalled()
    })
  })
})
