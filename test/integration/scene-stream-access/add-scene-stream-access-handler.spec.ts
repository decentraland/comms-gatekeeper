import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { InvalidRequestError, PlaceAttributes } from '../../../src/types'
import { IngressInfo } from 'livekit-server-sdk/dist/proto/livekit_ingress'

test('GET /scene-stream-access - gets streaming access for scenes', ({ components, stubComponents }) => {
  const FOUR_DAYS = 4 * 24 * 60 * 60
  const placeId = `place-id-stream-access`
  const anotherPlaceId = `another-place-id-stream-access`
  const placeWorldId = `place-id-world-stream-access`
  let cleanup: TestCleanup

  type Metadata = {
    identity: string
    realmName: string
    parcel: string
    hostname: string
    sceneId: string
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
      id: 'mock-ingress-id',
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
      realmName: 'test-realm',
      parcel: '10,20',
      hostname: 'https://peer.decentraland.zone',
      sceneId: 'test-scene'
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      realmName: 'name.dcl.eth',
      parcel: '20,20',
      hostname: 'https://worlds-content-server.decentraland.org/',
      sceneId: 'test-scene'
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)
    stubComponents.sceneFetcher.getPlace.resolves({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)
    stubComponents.sceneFetcher.hasLandPermission.resolves(true)
    stubComponents.sceneFetcher.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.livekit.getSceneRoomName.resolves(`test-realm:test-scene`)
    stubComponents.livekit.getWorldRoomName.resolves(`name.dcl.eth`)
    stubComponents.livekit.getOrCreateIngress.resolves(mockIngress)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 200 with streaming access when user has land permission', async () => {
    const { localFetch, database } = components

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

    const accessResult = await database.query(`
      SELECT * FROM scene_stream_access 
      WHERE place_id = '${placeId}' AND active = true
    `)

    expect(accessResult.rowCount).toBe(1)
    const savedAccess = accessResult.rows[0]
    expect(savedAccess.streaming_url).toBe(mockIngress.url)
    expect(savedAccess.streaming_key).toBe(mockIngress.streamKey)

    if (body) {
      const { ends_at, ...dbFields } = body
      cleanup.trackInsert('scene_stream_access', dbFields)
    }

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: body.created_at,
      ends_at: Number(body.created_at) + FOUR_DAYS
    })

    const created = Number(body.created_at)
    const ends = Number(body.ends_at)
    expect(ends).toBeGreaterThan(created)
  })

  it('returns 200 with streaming access when user has world permission', async () => {
    const { localFetch, database } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.sceneFetcher.getPlace.resolves({
      id: placeWorldId,
      world_name: 'name.dcl.eth'
    } as PlaceAttributes)
    stubComponents.sceneFetcher.hasLandPermission.resolves(false)
    stubComponents.sceneFetcher.hasWorldOwnerPermission.resolves(true)

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

    const accessResult = await database.query(`
      SELECT * FROM scene_stream_access 
      WHERE place_id = '${placeWorldId}' AND active = true
    `)

    expect(accessResult.rowCount).toBe(1)
    const savedAccess = accessResult.rows[0]
    expect(savedAccess.streaming_url).toBe(mockIngress.url)
    expect(savedAccess.streaming_key).toBe(mockIngress.streamKey)

    if (body) {
      const { ends_at, ...dbFields } = body
      cleanup.trackInsert('scene_stream_access', dbFields)
    }

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: body.created_at,
      ends_at: Number(body.created_at) + FOUR_DAYS
    })
  })

  it('returns 200 with streaming access when user is an admin', async () => {
    const { localFetch } = components

    stubComponents.sceneFetcher.hasLandPermission.resolves(false)
    stubComponents.sceneFetcher.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(true)

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
      created_at: body.created_at,
      ends_at: Number(body.created_at) + FOUR_DAYS
    })
  })

  it('returns 200 with a new streaming access when it does not exist', async () => {
    const { localFetch, database } = components

    stubComponents.sceneFetcher.getPlace.resolves({
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

    const accessResult = await database.query(`
      SELECT * FROM scene_stream_access 
      WHERE place_id = '${anotherPlaceId}' AND active = true
    `)

    expect(accessResult.rowCount).toBe(1)
    const savedAccess = accessResult.rows[0]
    expect(savedAccess.streaming_url).toBe(mockIngress.url)
    expect(savedAccess.streaming_key).toBe(mockIngress.streamKey)

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

    stubComponents.sceneFetcher.hasLandPermission.resolves(false)
    stubComponents.sceneFetcher.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)

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
    const body = await response.json()
    expect(body.error).toBe('Access denied, you are not authorized to access this scene')
  })

  it('returns 401 if no sceneId in a land request', async () => {
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

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Access denied, invalid signed-fetch request, no sceneId')
  })

  it('returns 400 when place is not found', async () => {
    const { localFetch } = components

    jest
      .spyOn(components.sceneFetcher, 'getPlace')
      .mockRejectedValueOnce(new InvalidRequestError('Could not find scene information'))

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

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/scene-stream-access', {
      method: 'POST'
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toBe('Invalid Auth Chain')
  })
})
