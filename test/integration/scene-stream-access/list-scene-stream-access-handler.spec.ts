import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import * as handlersUtils from '../../../src/logic/utils'
import { InvalidRequestError, StreamingAccessUnavailableError } from '../../../src/types'
import { PlaceAttributes } from '../../../src/types/places.type'

test('GET /scene-stream-access - lists streaming access for scenes', ({ components, stubComponents }) => {
  const FOUR_DAYS = 4 * 24 * 60 * 60
  const placeId = `place-id-stream-access-list`
  const placeWorldId = `place-id-world-stream-access-list`

  type Metadata = {
    identity: string
    realmName: string
    parcel: string
    hostname: string
    sceneId: string
  }

  let metadataLand: Metadata
  let metadataWorld: Metadata
  let mockSceneStreamAccess: any

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
    stubComponents.places.getPlace.resolves({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)
    stubComponents.lands.hasLandPermission.resolves(true)
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneStreamAccessManager.getAccess.resolves(mockSceneStreamAccess)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)
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
      created_at: mockSceneStreamAccess.created_at,
      ends_at: mockSceneStreamAccess.created_at + FOUR_DAYS
    })
  })

  it('returns 200 with streaming access when user has world permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlace.resolves({
      id: placeWorldId,
      world_name: 'name.dcl.eth'
    } as PlaceAttributes)
    stubComponents.lands.hasLandPermission.resolves(false)
    stubComponents.worlds.hasWorldOwnerPermission.resolves(true)

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
      created_at: mockSceneStreamAccess.created_at,
      ends_at: mockSceneStreamAccess.created_at + FOUR_DAYS
    })
  })

  it('returns 200 with streaming access when user is an admin', async () => {
    const { localFetch } = components

    stubComponents.lands.hasLandPermission.resolves(false)
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
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
      created_at: mockSceneStreamAccess.created_at,
      ends_at: mockSceneStreamAccess.created_at + FOUR_DAYS
    })
  })

  it('returns 401 when user is not owner or admin', async () => {
    const { localFetch } = components

    stubComponents.lands.hasLandPermission.resolves(false)
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(false)

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

    stubComponents.places.getPlace.rejects(new InvalidRequestError('Could not find scene information'))

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
