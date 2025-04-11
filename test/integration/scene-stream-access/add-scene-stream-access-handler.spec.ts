import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'
import { InvalidRequestError, StreamingAccessNotFoundError } from '../../../src/types/errors'
import { IngressInfo } from 'livekit-server-sdk'

test('GET /scene-stream-access - gets streaming access for scenes', ({ components, stubComponents }) => {
  const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000
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
      parcel: '10,20'
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'name.dcl.eth',
        hostname: 'https://worlds-content-server.decentraland.org/',
        protocol: 'https'
      },
      sceneId: 'test-scene',
      parcel: '20,20'
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)

    stubComponents.places.getPlaceByParcel.resolves({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)

    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeWorldId,
      world_name: 'name.dcl.eth',
      owner: owner.authChain[0].payload
    } as PlaceAttributes)

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.livekit.getSceneRoomName.resolves(`test-realm:test-scene`)
    stubComponents.livekit.getWorldRoomName.resolves(`name.dcl.eth`)
    stubComponents.livekit.getOrCreateIngress.resolves(mockIngress)
    stubComponents.sceneStreamAccessManager.getAccess.resolves(mockSceneStreamAccess)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
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

    const created = Number(body.created_at)
    const ends = Number(body.ends_at) + FOUR_DAYS
    expect(ends).toBeGreaterThan(created)
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

  it('returns 200 with streaming access when user is an admin', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(true)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: true,
      hasExtendedPermissions: false
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

    stubComponents.places.getPlaceByParcel.resolves({
      id: anotherPlaceId,
      positions: ['11,22'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)
    stubComponents.livekit.getSceneRoomName.resolves(`another-test-realm:another-test-scene`)
    stubComponents.livekit.getOrCreateIngress.resolves(mockIngress)

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

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(false)

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

    stubComponents.places.getPlaceByParcel.rejects(new InvalidRequestError('Could not find scene information'))

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
  const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000
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
      sceneId: 'test-scene'
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'name.dcl.eth',
        hostname: 'https://worlds-content-server.decentraland.org/',
        protocol: 'https'
      },
      parcel: '20,20',
      sceneId: 'test-scene'
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)

    stubComponents.places.getPlaceByParcel.resolves({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)

    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeWorldId,
      world_name: 'name.dcl.eth',
      owner: owner.authChain[0].payload
    } as PlaceAttributes)

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneStreamAccessManager.addAccess.resolves(mockSceneStreamAccess)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
    stubComponents.sceneStreamAccessManager.getAccess.resolves(mockSceneStreamAccess)
    stubComponents.livekit.getOrCreateIngress.resolves({
      name: 'mock-ingress',
      url: 'rtmp://mock-stream-url',
      streamKey: 'mock-stream-key',
      ingressId: 'mock-ingress-id'
    } as IngressInfo)
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

  it('returns 200 with streaming access when is an admin', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(true)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: true,
      hasExtendedPermissions: false
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

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(false)

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

    stubComponents.sceneStreamAccessManager.getAccess.rejects(
      new StreamingAccessNotFoundError('Streaming access unavailable')
    )
    stubComponents.sceneStreamAccessManager.addAccess.rejects(
      new StreamingAccessNotFoundError('Streaming access unavailable')
    )
    stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })
    stubComponents.livekit.getOrCreateIngress.resolves({
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

    stubComponents.places.getPlaceByParcel.rejects(new InvalidRequestError('Invalid request'))

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
