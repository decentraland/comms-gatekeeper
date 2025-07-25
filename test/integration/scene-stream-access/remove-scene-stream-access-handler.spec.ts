import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { InvalidRequestError } from '../../../src/types/errors'
import { PlaceAttributes } from '../../../src/types/places.type'
import { IngressInfo } from 'livekit-server-sdk'

test('DELETE /scene-stream-access - removes streaming access for scenes', ({ components, stubComponents }) => {
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
    parcel: string
    sceneId: string
  }

  let metadataLand: Metadata
  let metadataWorld: Metadata
  let mockSceneStreamAccess: any
  let mockIngress: IngressInfo

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

    stubComponents.sceneStreamAccessManager.getAccess.resolves(mockSceneStreamAccess)
    stubComponents.sceneStreamAccessManager.removeAccess.resolves()
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
    stubComponents.livekit.removeIngress.resolves(mockIngress)
    stubComponents.notifications.sendNotificationType.resolves()
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 204 when user has land permission and successfully removes streaming access', async () => {
    const { localFetch } = components

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'DELETE',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(204)
    expect(stubComponents.sceneStreamAccessManager.removeAccess.calledOnce).toBe(true)
    expect(stubComponents.sceneStreamAccessManager.removeAccess.calledWith(placeId)).toBe(true)
    expect(stubComponents.livekit.removeIngress.calledOnce).toBe(true)
    expect(stubComponents.livekit.removeIngress.calledWith(mockSceneStreamAccess.ingress_id)).toBe(true)
  })

  it('returns 204 when user has world permission and successfully removes streaming access', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'DELETE',
        metadata: metadataWorld
      },
      owner
    )

    expect(response.status).toBe(204)
  })

  it('returns 204 when user is an admin and successfully removes streaming access', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandPermissions.resolves({
      owner: false,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
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
        method: 'DELETE',
        metadata: metadataLand
      },
      admin
    )

    expect(response.status).toBe(204)
  })

  it('returns 401 when user is not owner or admin', async () => {
    const { localFetch } = components

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
        method: 'DELETE',
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Access denied, you are not authorized to access this scene')
  })

  it('returns 400 if no sceneId in a land request', async () => {
    const { localFetch } = components

    const metadataNoSceneId = { ...metadataLand, sceneId: '' }
    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataNoSceneId)

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'DELETE',
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
      method: 'DELETE'
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when place is not found', async () => {
    const { localFetch } = components

    stubComponents.places.getPlaceByParcel.rejects(new InvalidRequestError('Could not find scene information'))

    const response = await makeRequest(
      localFetch,
      '/scene-stream-access',
      {
        method: 'DELETE',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })
})
