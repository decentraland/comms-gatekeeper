import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'
import { PlaceNotFoundError } from '../../../src/types/errors'
import { SceneAdmin } from '../../../src/types'
import { InvalidRequestError } from '../../../src/types/errors'

test('GET /scene-admin - lists all active administrators for scenes', ({ components, stubComponents }) => {
  let cleanup: TestCleanup
  const placeId = `place-id-list`
  const placeId2 = `place-id-list-2`
  type Metadata = {
    identity: string
    realmName: string
    parcel: string
    hostname: string
    sceneId: string
  }

  let metadataLand: Metadata
  let metadataWorld: Metadata
  let adminResults: SceneAdmin[]
  let adminResults2: SceneAdmin[]
  let allAdminResults: SceneAdmin[]

  beforeEach(async () => {
    cleanup = new TestCleanup(components.database)
    allAdminResults = []

    const { sceneAdminManager } = components

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: admin.authChain[0].payload,
      added_by: owner.authChain[0].payload
    })

    adminResults = await sceneAdminManager.listActiveAdmins({
      place_id: placeId,
      admin: admin.authChain[0].payload
    })

    if (adminResults?.length > 0) {
      allAdminResults.push(adminResults[0])
      cleanup.trackInsert('scene_admin', { id: adminResults[0].id })
    }

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: nonOwner.authChain[0].payload,
      added_by: owner.authChain[0].payload
    })

    adminResults2 = await sceneAdminManager.listActiveAdmins({
      place_id: placeId,
      admin: nonOwner.authChain[0].payload
    })

    if (adminResults2?.length > 0) {
      allAdminResults.push(adminResults2[0])
      cleanup.trackInsert('scene_admin', { id: adminResults2[0].id })
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
    stubComponents.places.getPlaceByParcel.resolves({
      id: placeId,
      positions: ['10,20'],
      world: false
    } as PlaceAttributes)

    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeId,
      world_name: 'name.dcl.eth',
      world: true
    } as PlaceAttributes)

    stubComponents.lands.hasLandUpdatePermission.resolves(false)
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.worlds.hasWorldStreamingPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)

    stubComponents.sceneAdminManager.listActiveAdmins.resolves(allAdminResults)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 200 with a list of scene admins when user has land permission', async () => {
    const { localFetch } = components

    stubComponents.lands.hasLandUpdatePermission.resolves(true)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)

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
    expect(body).toEqual(allAdminResults)
  })

  it('returns 200 with a list of scene admins when user has world permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeId,
      world_name: 'name.dcl.eth',
      world: true
    } as PlaceAttributes)

    stubComponents.worlds.hasWorldOwnerPermission.resolves(true)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)

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
    expect(body).toEqual(allAdminResults)
  })

  it('returns 200 with a list of scene admins when user has world streaming permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlaceByParcel.resolves({
      id: placeId,
      world_name: 'name.dcl.eth',
      world: true
    } as PlaceAttributes)
    stubComponents.worlds.hasWorldStreamingPermission.resolves(true)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)

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
    expect(body).toEqual(allAdminResults)
  })

  it('returns 200 with a list of scene admins when user is an admin', async () => {
    const { localFetch } = components

    stubComponents.sceneAdminManager.isAdmin.resolves(true)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)

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
    expect(body).toEqual(allAdminResults)
  })

  it('returns 200 with a list of scene admins and a filtered list when using query parameters', async () => {
    const { localFetch } = components

    const mockResponse = [
      {
        id: 'test-id',
        place_id: placeId,
        admin: nonOwner.authChain[0].payload.toLowerCase(),
        added_by: owner.authChain[0].payload.toLowerCase(),
        active: true,
        created_at: Date.now()
      }
    ]

    stubComponents.sceneAdminManager.listActiveAdmins.resolves(mockResponse)

    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)
    const response = await makeRequest(
      localFetch,
      `/scene-admin?admin=${nonOwner.authChain[0].payload}`,
      {
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(1)
    expect(body[0].admin).toBe(nonOwner.authChain[0].payload.toLowerCase())
  })

  it('returns 401 when user is not authorized', async () => {
    const { localFetch } = components

    stubComponents.sceneManager.hasPermissionPrivilege.resolves(false)

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
    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 404 when place is not found', async () => {
    const { localFetch } = components

    stubComponents.places.getPlaceByParcel.rejects(new PlaceNotFoundError('Could not find scene information'))

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

  it('returns 200 with only active scene admins for land owner', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataLand)
    stubComponents.places.getPlaceByParcel.resolves({
      id: placeId,
      positions: ['10,20']
    } as PlaceAttributes)
    stubComponents.lands.hasLandUpdatePermission.resolves(true)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)

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
    expect(body).toEqual(allAdminResults)
  })

  it('returns 200 with only active scene admins for the world owner', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeId,
      world_name: 'name.dcl.eth'
    } as PlaceAttributes)

    stubComponents.lands.hasLandUpdatePermission.resolves(false)
    stubComponents.worlds.hasWorldOwnerPermission.resolves(true)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)

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
    expect(body).toEqual(allAdminResults)
  })

  it('returns 404 when the scene is not found', async () => {
    const { localFetch } = components

    stubComponents.places.getPlaceByParcel.rejects(new PlaceNotFoundError('Could not find scene information'))

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

  it('returns 200 with a list of scene admins when user is streaming admin', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeId,
      world_name: 'name.dcl.eth',
      world: true
    } as PlaceAttributes)
    stubComponents.worlds.hasWorldStreamingPermission.resolves(true)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)

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
    expect(body).toEqual(allAdminResults)
  })
})
