import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types'

test('GET /scene-admin - lists all active administrators for scenes', ({ components }) => {
  const testPlaceId = `place-id-list`
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

  beforeEach(async () => {
    cleanup = new TestCleanup(components.database)

    const { sceneAdminManager } = components

    await sceneAdminManager.removeAdmin(placeId, admin.authChain[0].payload)

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: admin.authChain[0].payload,
      added_by: owner.authChain[0].payload
    })

    const adminResults = await sceneAdminManager.listActiveAdmins({
      place_id: placeId,
      admin: admin.authChain[0].payload
    })

    if (adminResults.length > 0) {
      cleanup.trackInsert('scene_admin', { id: adminResults[0].id })
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
    jest.spyOn(components.sceneFetcher, 'hasWorldOwnerPermission').mockResolvedValue(false)
    jest.spyOn(components.sceneFetcher, 'hasWorldStreamingPermission').mockResolvedValue(false)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 200 with a list of scene admins when user has land permission', async () => {
    const { localFetch } = components

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 200 with a list of scene admins when user has world permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    jest.spyOn(components.sceneFetcher, 'getPlace').mockResolvedValueOnce({
      id: placeId,
      world_name: 'name.dcl.eth'
    } as PlaceAttributes)
    jest.spyOn(components.sceneFetcher, 'hasWorldOwnerPermission').mockResolvedValueOnce(true)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'GET',
        metadata: metadataWorld
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 200 with a list of scene admins when user has world streaming permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    jest.spyOn(components.sceneFetcher, 'getPlace').mockResolvedValueOnce({
      id: placeId,
      world_name: 'name.dcl.eth'
    } as PlaceAttributes)
    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneFetcher, 'hasWorldOwnerPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneFetcher, 'hasWorldStreamingPermission').mockResolvedValueOnce(true)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'GET',
        metadata: metadataWorld
      },
      nonOwner
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 200 with a list of scene admins when user is an admin', async () => {
    const { localFetch } = components

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneFetcher, 'hasWorldOwnerPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(true)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'GET',
        metadata: metadataLand
      },
      admin
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 403 when user is not owner or admin', async () => {
    const { localFetch } = components

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneFetcher, 'hasWorldOwnerPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(false)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'GET',
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(401)
  })

  it('returns 200 and a filtered list when using query parameters', async () => {
    const { localFetch } = components

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(true)

    const response = await makeRequest(
      localFetch,
      '/scene-admin?admin=0x333',
      {
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 404 when place is not found', async () => {
    const { localFetch } = components

    jest.spyOn(components.sceneFetcher, 'getPlace').mockResolvedValueOnce(null)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(404)
  })

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/scene-admin', {
      method: 'GET'
    })

    expect(response.status).toBe(400)
  })
})
