import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import SQL from 'sql-template-strings'
import * as handlersUtils from '../../../src/controllers/handlers/utils'
import { PlaceAttributes } from '../../../src/types'

test('GET /scene-admin - lists all active administrators for scenes', ({ components }) => {
  let cleanup: TestCleanup
  const placeId = 'place-id'

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
    cleanup = new TestCleanup(components.pg)

    const { sceneAdminManager } = components

    await sceneAdminManager.removeAdmin(placeId, admin.authChain[0].payload)

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: admin.authChain[0].payload,
      added_by: owner.authChain[0].payload
    })

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
    jest.spyOn(handlersUtils, 'getPlace').mockResolvedValue({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)
    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValue(true)
    jest.spyOn(handlersUtils, 'hasWorldPermission').mockResolvedValue(false)
    jest.spyOn(handlersUtils, 'isPlaceAdmin').mockResolvedValue(false)
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
    jest.spyOn(handlersUtils, 'getPlace').mockResolvedValueOnce({
      id: placeId,
      world_name: 'name.dcl.eth'
    } as PlaceAttributes)
    jest.spyOn(handlersUtils, 'hasWorldPermission').mockResolvedValueOnce(true)

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

  it('returns 200 when user is admin and has land permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'isPlaceAdmin').mockResolvedValueOnce(true)

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

  it('returns 400 when user has no permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(handlersUtils, 'isPlaceAdmin').mockResolvedValueOnce(false)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'GET',
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(400)
  })

  it('returns 200 and a filtered list when using query parameters', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(true)

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

    jest.spyOn(handlersUtils, 'getPlace').mockResolvedValueOnce(null)

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
