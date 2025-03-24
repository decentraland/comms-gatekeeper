import { test } from '../../components'
import { makeRequest, owner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'
import { admin, nonOwner } from '../../utils'
import { AuthLinkType } from '@dcl/crypto'

test('POST /scene-admin - adds administrator access for a scene who can add other admins', ({
  components,
  stubComponents
}) => {
  const testPlaceId = `place-id-add`

  type Metadata = {
    identity: string
    realmName: string
    parcel: string
    hostname: string
    sceneId: string
  }
  let cleanup: TestCleanup
  let metadataLand: Metadata
  let metadataWorld: Metadata

  beforeAll(async () => {
    cleanup = new TestCleanup(components.database)
  })

  beforeEach(async () => {
    metadataLand = {
      identity: owner.authChain[0].payload,
      realmName: 'test-realm',
      parcel: '-9,-9',
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
      positions: [metadataLand.parcel],
      id: testPlaceId,
      world: false
    } as PlaceAttributes)

    stubComponents.places.getPlaceByWorldName.resolves({
      id: testPlaceId,
      world_name: 'name.dcl.eth',
      world: true
    } as PlaceAttributes)

    stubComponents.lands.hasLandUpdatePermission.resolves(true)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(false)
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.worlds.hasWorldStreamingPermission.resolves(false)
  })

  afterEach(async () => {
    await cleanup.cleanup()
  })

  it('returns 204 when successfully adding a scene admin', async () => {
    const { localFetch, sceneAdminManager } = components
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)
    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'POST',
        body: JSON.stringify({
          admin: admin.authChain[0].payload
        }),
        metadata: metadataLand
      },
      owner
    )
    expect(response.status).toBe(204)
    const result = await sceneAdminManager.listActiveAdmins({
      place_id: testPlaceId,
      admin: admin.authChain[0].payload
    })

    if (result.length > 0) {
      cleanup.trackInsert('scene_admin', { id: result[0].id })
    }

    expect(result.length).toBe(1)
    expect(result[0].active).toBe(true)
  })

  it('returns 204 when user has world streaming permission', async () => {
    const { localFetch, sceneAdminManager } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlaceByWorldName.resolves({
      id: testPlaceId,
      world_name: 'name.dcl.eth'
    } as PlaceAttributes)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)
    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'POST',
        body: JSON.stringify({
          admin: admin.authChain[0].payload
        }),
        metadata: metadataWorld
      },
      nonOwner
    )

    expect(response.status).toBe(204)

    const result = await sceneAdminManager.listActiveAdmins({
      place_id: testPlaceId,
      admin: admin.authChain[0].payload
    })

    if (result.length > 0) {
      cleanup.trackInsert('scene_admin', { id: result[0].id })
    }

    expect(result.length).toBe(1)
    expect(result[0].active).toBe(true)
  })

  it('returns 401 when authentication is provided but invalid', async () => {
    const { localFetch } = components

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'POST',
        body: JSON.stringify({ admin: admin.authChain[0].payload }),
        metadata: metadataLand
      },
      { ...owner, authChain: [...owner.authChain, { type: AuthLinkType.SIGNER, payload: 'invalid-signature' }] }
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/scene-admin', {
      method: 'POST'
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when admin address is invalid', async () => {
    const { localFetch } = components

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'POST',
        body: JSON.stringify({
          admin: 'invalid-address'
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 401 when user is not owner or admin', async () => {
    const { localFetch } = components

    stubComponents.lands.hasLandUpdatePermission.resolves(false)
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'POST',
        body: JSON.stringify({
          admin: admin.authChain[0].payload
        }),
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 when admin already exists', async () => {
    const { localFetch } = components
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)
    stubComponents.sceneManager.isSceneOwner.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(true)
    stubComponents.sceneManager.hasPermissionPrivilege.resolves(true)
    stubComponents.sceneManager.isSceneOwner.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(true)

    stubComponents.places.getPlaceByParcel.resolves({
      positions: [metadataLand.parcel],
      id: testPlaceId,
      world: false
    } as PlaceAttributes)

    await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'POST',
        body: JSON.stringify({
          admin: admin.authChain[0].payload
        }),
        metadata: metadataLand
      },
      owner
    )

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'POST',
        body: JSON.stringify({
          admin: admin.authChain[0].payload
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })
})
