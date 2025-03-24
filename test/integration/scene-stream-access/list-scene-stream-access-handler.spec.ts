import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { InvalidRequestError, PlaceAttributes, StreamingAccessUnavailableError } from '../../../src/types'

test('GET /scene-stream-access - lists streaming access for scenes', ({ components, stubComponents }) => {
  const FOUR_DAYS = 4 * 24 * 60 * 60
  const placeId = `place-id-stream-access-list`
  const placeWorldId = `place-id-world-stream-access-list`
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
    stubComponents.sceneFetcher.getPlace.resolves({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)
    stubComponents.sceneFetcher.hasLandPermission.resolves(true)
    stubComponents.sceneFetcher.hasWorldPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneStreamAccessManager.getAccess.resolves(mockSceneStreamAccess)
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
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: body.created_at,
      ends_at: Number(body.created_at) + FOUR_DAYS
    })
  })

  it('returns 200 with streaming access when user has world permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.sceneFetcher.getPlace.resolves({
      id: placeWorldId,
      world_name: 'name.dcl.eth'
    } as PlaceAttributes)
    stubComponents.sceneFetcher.hasLandPermission.resolves(false)
    stubComponents.sceneFetcher.hasWorldPermission.resolves(true)

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
    stubComponents.sceneFetcher.hasWorldPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(true)

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

    expect(body).toEqual({
      streaming_url: mockSceneStreamAccess.streaming_url,
      streaming_key: mockSceneStreamAccess.streaming_key,
      created_at: body.created_at,
      ends_at: Number(body.created_at) + FOUR_DAYS
    })
  })

  it('returns 401 when user is not owner or admin', async () => {
    const { localFetch } = components

    stubComponents.sceneFetcher.hasLandPermission.resolves(false)
    stubComponents.sceneFetcher.hasWorldPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)

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
        method: 'GET',
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

  it('returns 404 when streaming access is not found', async () => {
    const { localFetch } = components

    stubComponents.sceneStreamAccessManager.getAccess.rejects(
      new StreamingAccessUnavailableError('Streaming access not found')
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

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Streaming access not found')
  })
})
