import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/controllers/handlers/utils'
import { PlaceAttributes, StreamingAccessUnavailableError } from '../../../src/types'
import { IngressInfo } from 'livekit-server-sdk/dist/proto/livekit_ingress'

test('GET /scene-stream-access - gets streaming access for scenes', ({ components }) => {
  const testPlaceId = `place-id-stream-access`
  let cleanup: TestCleanup
  const placeId = testPlaceId

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

  beforeEach(async () => {
    cleanup = new TestCleanup(components.database)

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
    jest.spyOn(components.sceneFetcher, 'getPlace').mockResolvedValue({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)
    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValue(true)
    jest.spyOn(components.sceneFetcher, 'hasWorldPermission').mockResolvedValue(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValue(false)
    jest.spyOn(components.livekit, 'getSceneRoomName').mockReturnValue(`test-realm:test-scene`)
    jest.spyOn(components.livekit, 'getWorldRoomName').mockReturnValue(`name.dcl.eth`)
    jest.spyOn(components.livekit, 'getOrCreateIngress').mockResolvedValue(mockIngress)
    jest.spyOn(components.sceneStreamAccessManager, 'getAccess').mockResolvedValue(mockSceneStreamAccess)
    jest.spyOn(components.sceneStreamAccessManager, 'addAccess').mockResolvedValue(undefined)
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
    expect(body).toHaveProperty('streaming_url')
    expect(body).toHaveProperty('streaming_key')
    expect(body.streaming_url).toBe(mockSceneStreamAccess.streaming_url)
    expect(body.streaming_key).toBe(mockSceneStreamAccess.streaming_key)
  })

  it('returns 200 with streaming access when user has world permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    jest.spyOn(components.sceneFetcher, 'getPlace').mockResolvedValueOnce({
      id: placeId,
      world_name: 'name.dcl.eth'
    } as PlaceAttributes)
    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneFetcher, 'hasWorldPermission').mockResolvedValueOnce(true)

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
    expect(body).toHaveProperty('streaming_url')
    expect(body).toHaveProperty('streaming_key')
  })

  it('returns 200 with streaming access when user is an admin', async () => {
    const { localFetch } = components

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneFetcher, 'hasWorldPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(true)

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
    expect(body).toHaveProperty('streaming_url')
    expect(body).toHaveProperty('streaming_key')
  })

  it('creates a new ingress when streaming access does not exist', async () => {
    const { localFetch } = components

    jest
      .spyOn(components.sceneStreamAccessManager, 'getAccess')
      .mockRejectedValueOnce(new StreamingAccessUnavailableError('No access'))
      .mockResolvedValueOnce(mockSceneStreamAccess)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(components.livekit.getOrCreateIngress).toHaveBeenCalled()
    expect(components.sceneStreamAccessManager.addAccess).toHaveBeenCalledWith({
      place_id: placeId,
      streaming_url: mockIngress.url,
      streaming_key: mockIngress.streamKey,
      ingress_id: mockIngress.ingressId
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('streaming_url')
    expect(body).toHaveProperty('streaming_key')
  })

  it('returns 401 when user is not owner or admin', async () => {
    const { localFetch } = components

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneFetcher, 'hasWorldPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(false)

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
  })

  it('returns 500 when place is not found', async () => {
    const { localFetch } = components

    jest.spyOn(components.sceneFetcher, 'getPlace').mockResolvedValueOnce(null)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(500)
  })

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/scene-stream-access', {
      method: 'GET'
    })

    expect(response.status).toBe(400)
  })
})
