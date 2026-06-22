import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { InvalidRequestError } from '../../../src/types/errors'
import { PlaceAttributes } from '../../../src/types/places.type'
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
    parcel: string
    sceneId: string
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
    stubComponents.places.getWorldByName.mockResolvedValue({
      id: 'world-place-id',
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
    stubComponents.worlds.hasWorldStreamingPermission.mockResolvedValue(false)
    stubComponents.worlds.hasWorldDeployPermission.mockResolvedValue(false)
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
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 200 with streaming access when user has land permission', async () => {
    const { localFetch } = components
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'GET',
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
      ends_at: Number(mockSceneStreamAccess.created_at) + FOUR_DAYS
    })
  })

  it('returns 200 with streaming access when user has world permission', async () => {
    const { localFetch } = components
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)

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

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'GET',
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

  it('returns 200 with streaming access when user is an admin', async () => {
    const { localFetch } = components
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)

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
        method: 'GET',
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
      ends_at: Number(mockSceneStreamAccess.created_at) + FOUR_DAYS
    })
  })

  it('returns 200 with a new streaming access when it does not exist', async () => {
    const { localFetch } = components
    stubComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)

    stubComponents.places.getPlaceByParcel.mockResolvedValue({
      id: anotherPlaceId,
      positions: ['15,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'GET',
        metadata: metadataLand
      },
      admin
    )

    if (response.status === 200) {
      const body = await response.json()
      if (body) {
        const { ends_at, ...dbFields } = body
        cleanup.trackInsert('scene_stream_access', dbFields)
      }

      expect(body).toHaveProperty('streaming_url')
      expect(body).toHaveProperty('streaming_key')
    }
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
        method: 'GET',
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 if no sceneId in a land request', async () => {
    const { localFetch } = components

    const metadataNoSceneId = { ...metadataLand, sceneId: '' }
    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce({
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'test-realm',
        hostname: 'https://peer.decentraland.zone',
        protocol: 'https'
      },
      parcel: '10,20',
      sceneId: '',
      isWorld: false
    })

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'GET',
        metadata: metadataNoSceneId
      },
      owner
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Access denied, invalid signed-fetch request, no sceneId')
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
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Could not find scene information')
  })

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/scene-stream-access', {
      method: 'GET'
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toBe('Invalid Auth Chain')
  })
})
