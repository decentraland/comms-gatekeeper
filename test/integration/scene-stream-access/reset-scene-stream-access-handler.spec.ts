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

    stubComponents.lands.getLandPermissions.resolves({
      owner: true,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
    stubComponents.livekit.getSceneRoomName.resolves(`test-realm:test-scene`)
    stubComponents.livekit.getWorldRoomName.resolves(`name.dcl.eth`)
    stubComponents.notifications.sendNotificationType.resolves()
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

    stubComponents.sceneStreamAccessManager.getAccess.resolves(mockSceneStreamAccess)
    stubComponents.livekit.removeIngress.resolves()
    stubComponents.sceneStreamAccessManager.removeAccess.resolves()
    stubComponents.livekit.getOrCreateIngress.resolves(newMockIngress)
    stubComponents.sceneStreamAccessManager.addAccess.resolves(newMockSceneStreamAccess)

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
      ends_at: newMockSceneStreamAccess.created_at + FOUR_DAYS
    })

    expect(stubComponents.sceneStreamAccessManager.getAccess.calledWith(placeId)).toBe(true)
    expect(stubComponents.livekit.removeIngress.calledWith(mockSceneStreamAccess.ingress_id)).toBe(true)
    expect(stubComponents.sceneStreamAccessManager.removeAccess.calledWith(placeId)).toBe(true)
    expect(stubComponents.livekit.getOrCreateIngress.called).toBe(true)
    expect(stubComponents.sceneStreamAccessManager.addAccess.called).toBe(true)
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

    stubComponents.sceneStreamAccessManager.getAccess.resolves(mockSceneStreamAccess)
    stubComponents.livekit.removeIngress.resolves()
    stubComponents.sceneStreamAccessManager.removeAccess.resolves()
    stubComponents.livekit.getOrCreateIngress.resolves(newMockIngress)
    stubComponents.sceneStreamAccessManager.addAccess.resolves(newMockSceneStreamAccess)

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
      ends_at: newMockSceneStreamAccess.created_at + FOUR_DAYS
    })

    expect(stubComponents.sceneStreamAccessManager.getAccess.calledWith(placeWorldId)).toBe(true)
    expect(stubComponents.livekit.removeIngress.calledWith(mockSceneStreamAccess.ingress_id)).toBe(true)
    expect(stubComponents.sceneStreamAccessManager.removeAccess.calledWith(placeWorldId)).toBe(true)
    expect(stubComponents.livekit.getOrCreateIngress.called).toBe(true)
    expect(stubComponents.sceneStreamAccessManager.addAccess.called).toBe(true)
  })

  it('returns 401 when user is not the land owner', async () => {
    const { localFetch } = components
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(false)

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
})
