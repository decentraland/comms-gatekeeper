import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'
import { InvalidRequestError, StreamingAccessNotFoundError } from '../../../src/types/errors'
import { IngressInfo } from 'livekit-server-sdk'
import { FOUR_DAYS } from '../../../src/logic/time'

test('GET /scene-stream-access - gets streaming access for scenes', ({ components, stubComponents }) => {
  const placeId = `place-id-stream-access`
  const anotherPlaceId = `another-place-id-stream-access`
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

    mockSceneStreamAccess = {
      id: 'mock-access-id',
      place_id: placeId,
      streaming_url: 'rtmp://mock-stream-url',
      streaming_key: 'mock-stream-key',
      ingress_id: 'mock-ingress-id',
      created_at: Date.now(),
      active: true
    }

    metadataLand = {
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'test-realm',
        hostname: 'https://peer.decentraland.zone',
        protocol: 'https'
      },
      sceneId: 'test-scene',
      parcel: '10,20',
      isWorld: false
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'name.dcl.eth',
        hostname: 'https://worlds-content-server.decentraland.org/',
        protocol: 'https'
      },
      sceneId: 'test-scene',
      parcel: '20,20',
      isWorld: true
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)

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
    stubComponents.worlds.hasWorldOwnerPermission.mockResolvedValue(false)
    stubComponents.sceneAdminManager.isAdmin.mockResolvedValue(false)
    stubComponents.livekit.getSceneRoomName.mockReturnValue(`test-realm:test-scene`)
    stubComponents.livekit.getWorldRoomName.mockReturnValue(`name.dcl.eth`)
    stubComponents.livekit.getOrCreateIngress.mockResolvedValue(mockIngress)
    stubComponents.sceneStreamAccessManager.getAccess.mockResolvedValue(mockSceneStreamAccess)
    stubComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
      owner: true,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
    stubComponents.sceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(null)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 200 with streaming access when user has land permission', async () => {
    const { localFetch } = components

    // Configure getLatestAccessByPlaceId to return existing access (reuse scenario)
    stubComponents.sceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(mockSceneStreamAccess)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    if (body) {
      const { ends_at, ...dbFields } = body
      cleanup.trackInsert('scene_stream_access', dbFields)
    }

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: Number(mockSceneStreamAccess.created_at),
      ends_at: mockSceneStreamAccess.expiration_time || Number(mockSceneStreamAccess.created_at) + FOUR_DAYS
    })

    const created = Number(body.created_at)
    const ends = Number(body.ends_at)
    expect(ends).toBeGreaterThan(created)
  })

  it('returns 200 with streaming access when user has world permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    // Configure getLatestAccessByPlaceId to return existing access (reuse scenario)
    stubComponents.sceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(mockSceneStreamAccess)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataWorld
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    if (body) {
      const { ends_at, ...dbFields } = body
      cleanup.trackInsert('scene_stream_access', dbFields)
    }

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: Number(mockSceneStreamAccess.created_at),
      ends_at: mockSceneStreamAccess.expiration_time || Number(mockSceneStreamAccess.created_at) + FOUR_DAYS
    })
  })

  it('returns 200 with streaming access when user is an admin', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandPermissions.mockResolvedValue({
      owner: false,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
    stubComponents.worlds.hasWorldOwnerPermission.mockResolvedValue(false)
    stubComponents.sceneAdminManager.isAdmin.mockResolvedValue(true)
    stubComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
      owner: false,
      admin: true,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    // Configure getLatestAccessByPlaceId to return existing access (reuse scenario)
    stubComponents.sceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(mockSceneStreamAccess)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataLand
      },
      admin
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    if (body) {
      const { ends_at, ...dbFields } = body
      cleanup.trackInsert('scene_stream_access', dbFields)
    }

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: Number(mockSceneStreamAccess.created_at),
      ends_at: mockSceneStreamAccess.expiration_time || Number(mockSceneStreamAccess.created_at) + FOUR_DAYS
    })
  })

  it('returns 200 with a new streaming access when it does not exist', async () => {
    const { localFetch } = components

    stubComponents.places.getPlaceByParcel.mockResolvedValue({
      id: anotherPlaceId,
      positions: ['11,22'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)
    stubComponents.livekit.getSceneRoomName.mockReturnValue(`another-test-realm:another-test-scene`)
    stubComponents.livekit.getOrCreateIngress.mockResolvedValue(mockIngress)
    stubComponents.sceneStreamAccessManager.addAccess.mockResolvedValue({
      ...mockIngress,
      id: 'new-access-id',
      place_id: anotherPlaceId,
      streaming_url: mockIngress.url!,
      streaming_key: mockIngress.streamKey!,
      ingress_id: mockIngress.ingressId!,
      created_at: Date.now(),
      active: true,
      streaming: false,
      streaming_start_time: 0,
      room_id: 'another-test-realm:another-test-scene',
      expiration_time: Date.now() + FOUR_DAYS
    } as any)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: { ...metadataLand, sceneId: 'another-test-scene', parcel: '11,22' }
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    if (body) {
      const { ends_at, ...dbFields } = body
      cleanup.trackInsert('scene_stream_access', dbFields)
    }

    expect(body).toHaveProperty('streaming_url')
    expect(body).toHaveProperty('streaming_key')
    expect(body).toHaveProperty('created_at')
    expect(body).toHaveProperty('ends_at')
  })

  it('returns 401 when user is not owner or admin', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandPermissions.mockResolvedValue({
      owner: false,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
    stubComponents.worlds.hasWorldOwnerPermission.mockResolvedValue(false)
    stubComponents.sceneAdminManager.isAdmin.mockResolvedValue(false)
    stubComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 if no sceneId in a land request', async () => {
    const { localFetch } = components

    const metadataNoSceneId = { ...metadataLand, sceneId: '' }
    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataNoSceneId)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataNoSceneId
      },
      owner
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Access denied, invalid signed-fetch request, no sceneId')
  })

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/scene-stream-access', {
      method: 'POST'
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toBe('Invalid Auth Chain')
  })

  it('returns 400 when place is not found', async () => {
    const { localFetch } = components

    stubComponents.places.getPlaceByParcel.mockRejectedValue(
      new InvalidRequestError('Could not find scene information')
    )

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Could not find scene information')
  })
})

test('POST /scene-stream-access - adds streaming access for a scene', ({ components, stubComponents }) => {
  const placeId = `place-id-stream-access-add`
  const placeWorldId = `place-id-world-stream-access-add`
  let cleanup: TestCleanup

  type Metadata = {
    identity: string
    realm: {
      serverName: string
      hostname: string
      protocol: string
    }
    parcel: string
    sceneId: string
    isWorld: boolean
  }

  let metadataLand: Metadata
  let metadataWorld: Metadata
  let mockSceneStreamAccess: any

  beforeAll(async () => {
    cleanup = new TestCleanup(components.database)
  })

  beforeEach(async () => {
    mockSceneStreamAccess = {
      id: 'mock-access-id',
      place_id: placeId,
      streaming_url: 'rtmp://mock-stream-url',
      streaming_key: 'mock-stream-key',
      ingress_id: 'mock-ingress-id',
      created_at: Date.now(),
      active: true,
      room_id: 'test-realm:test-scene',
      expiration_time: Date.now() + 4 * 24 * 60 * 60 * 1000
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

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)

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
    stubComponents.worlds.hasWorldOwnerPermission.mockResolvedValue(false)
    stubComponents.sceneAdminManager.isAdmin.mockResolvedValue(false)
    stubComponents.sceneStreamAccessManager.addAccess.mockResolvedValue(mockSceneStreamAccess)
    stubComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
      owner: true,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
    stubComponents.sceneStreamAccessManager.getAccess.mockResolvedValue(mockSceneStreamAccess)
    stubComponents.sceneStreamAccessManager.getLatestAccessByPlaceId.mockResolvedValue(null)
    stubComponents.livekit.getOrCreateIngress.mockResolvedValue({
      name: 'mock-ingress',
      url: 'rtmp://mock-stream-url',
      streamKey: 'mock-stream-key',
      ingressId: 'mock-ingress-id'
    } as IngressInfo)
    stubComponents.livekit.getSceneRoomName.mockReturnValue('test-realm:test-scene')
    stubComponents.livekit.getWorldRoomName.mockReturnValue('name.dcl.eth')
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 200 with streaming access when user has land permission', async () => {
    const { localFetch } = components

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: Number(mockSceneStreamAccess.created_at),
      ends_at: Number(mockSceneStreamAccess.created_at) + FOUR_DAYS
    })
  })

  it('returns 200 with streaming access when user has world permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataWorld
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    if (body) {
      const { ends_at, ...dbFields } = body
      cleanup.trackInsert('scene_stream_access', dbFields)
    }

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: Number(mockSceneStreamAccess.created_at),
      ends_at: Number(mockSceneStreamAccess.created_at) + FOUR_DAYS
    })
  })

  describe('when world has sceneId', () => {
    const sceneId = 'bafkreiworldscene123'

    beforeEach(() => {
      const metadataWorldWithSceneId = {
        ...metadataWorld,
        sceneId
      }

      jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorldWithSceneId)
      stubComponents.livekit.getWorldSceneRoomName.mockReturnValue(`world-prod-scene-room-name.dcl.eth-${sceneId}`)
    })

    it('should get the world scene room with the scene id', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-stream-access',
        {
          method: 'POST',
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
          method: 'POST',
          metadata: { ...metadataWorld, sceneId: undefined }
        },
        owner
      )

      expect(response.status).toBe(400)
    })
  })

  it('returns 200 with streaming access when is an admin', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandPermissions.mockResolvedValue({
      owner: false,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
    stubComponents.worlds.hasWorldOwnerPermission.mockResolvedValue(false)
    stubComponents.sceneAdminManager.isAdmin.mockResolvedValue(true)
    stubComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
      owner: false,
      admin: true,
      hasExtendedPermissions: false,
      hasLandLease: false
    })

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataLand
      },
      admin
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: Number(mockSceneStreamAccess.created_at),
      ends_at: Number(mockSceneStreamAccess.created_at) + FOUR_DAYS
    })
  })

  it('returns 401 when user is not authorized', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandPermissions.mockResolvedValue({
      owner: false,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
    stubComponents.worlds.hasWorldOwnerPermission.mockResolvedValue(false)
    stubComponents.sceneAdminManager.isAdmin.mockResolvedValue(false)
    stubComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(401)
  })

  it('returns 404 when streaming access creation fails', async () => {
    const { localFetch } = components

    stubComponents.sceneStreamAccessManager.getAccess.mockRejectedValue(
      new StreamingAccessNotFoundError('Streaming access unavailable')
    )
    stubComponents.sceneStreamAccessManager.addAccess.mockRejectedValue(
      new StreamingAccessNotFoundError('Streaming access unavailable')
    )
    stubComponents.lands.getLandPermissions.mockResolvedValue({
      owner: true,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
    stubComponents.worlds.hasWorldOwnerPermission.mockResolvedValue(false)
    stubComponents.sceneAdminManager.isAdmin.mockResolvedValue(false)
    stubComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
      owner: true,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    stubComponents.livekit.getOrCreateIngress.mockResolvedValue({
      name: 'mock-ingress',
      url: 'rtmp://mock-stream-url',
      streamKey: 'mock-stream-key',
      ingressId: 'mock-ingress-id'
    } as IngressInfo)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(404)
  })

  it('returns 400 when request is invalid', async () => {
    const { localFetch } = components

    stubComponents.places.getPlaceByParcel.mockRejectedValue(new InvalidRequestError('Invalid request'))

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'POST',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })
})
