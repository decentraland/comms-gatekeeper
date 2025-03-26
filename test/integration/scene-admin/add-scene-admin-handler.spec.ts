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
    parcel: string
    sceneId: string
    realm: {
      serverName: string
      hostname: string
      protocol: string
    }
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
      parcel: '-9,-9',
      sceneId: 'test-scene',
      realm: {
        serverName: 'test-realm',
        hostname: 'https://peer.decentraland.zone',
        protocol: 'https'
      }
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      parcel: '20,20',
      sceneId: 'test-scene',
      realm: {
        serverName: 'name.dcl.eth',
        hostname: 'https://worlds-content-server.decentraland.org/',
        protocol: 'https'
      }
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

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
    stubComponents.sceneManager.resolveUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false
    })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.worlds.hasWorldStreamingPermission.resolves(false)
    stubComponents.worlds.hasWorldDeployPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.isSceneOwner.resolves(false)

    stubComponents.sceneAdminManager.addAdmin.resolves()
    stubComponents.sceneAdminManager.listActiveAdmins.resolves([
      {
        id: 'test-admin-id',
        place_id: testPlaceId,
        admin: admin.authChain[0].payload.toLowerCase(),
        added_by: owner.authChain[0].payload.toLowerCase(),
        active: true,
        created_at: Date.now()
      }
    ])
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 204 when successfully adding a scene admin', async () => {
    const { localFetch } = components

    stubComponents.sceneManager.resolveUserScenePermissions
      .onFirstCall()
      .resolves({
        owner: true,
        admin: false,
        hasExtendedPermissions: false
      })
      .onSecondCall()
      .resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false
      })

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
    expect(stubComponents.sceneAdminManager.addAdmin.calledOnce).toBe(true)

    const result = await components.sceneAdminManager.listActiveAdmins({
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
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)

    stubComponents.sceneManager.resolveUserScenePermissions
      .onFirstCall()
      .resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: true
      })
      .onSecondCall()
      .resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false
      })

    stubComponents.sceneAdminManager.listActiveAdmins.resolves([
      {
        id: 'test-admin-id',
        place_id: testPlaceId,
        admin: admin.authChain[0].payload.toLowerCase(),
        added_by: nonOwner.authChain[0].payload.toLowerCase(),
        active: true,
        created_at: Date.now()
      }
    ])

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
    expect(stubComponents.sceneAdminManager.addAdmin.calledOnce).toBe(true)

    const result = await components.sceneAdminManager.listActiveAdmins({
      place_id: testPlaceId,
      admin: admin.authChain[0].payload
    })

    if (result.length > 0) {
      cleanup.trackInsert('scene_admin', { id: result[0].id })
    }

    expect(result.length).toBe(1)
    expect(result[0].active).toBe(true)
  })

  it('returns 204 when user has operator permission', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: true })

    stubComponents.sceneManager.resolveUserScenePermissions
      .onFirstCall()
      .resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: true
      })
      .onSecondCall()
      .resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false
      })

    stubComponents.sceneAdminManager.listActiveAdmins.resolves([
      {
        id: 'test-admin-id',
        place_id: testPlaceId,
        admin: admin.authChain[0].payload.toLowerCase(),
        added_by: nonOwner.authChain[0].payload.toLowerCase(),
        active: true,
        created_at: Date.now()
      }
    ])

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

    expect(response.status).toBe(204)
    expect(stubComponents.sceneAdminManager.addAdmin.calledOnce).toBe(true)
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

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.resolveUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false
    })

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

    stubComponents.sceneManager.resolveUserScenePermissions
      .onFirstCall()
      .resolves({
        owner: false,
        admin: true,
        hasExtendedPermissions: false
      })
      .onSecondCall()
      .resolves({
        owner: false,
        admin: true,
        hasExtendedPermissions: false
      })

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

  it('returns 400 when trying to add an owner as admin', async () => {
    const { localFetch } = components

    stubComponents.sceneManager.resolveUserScenePermissions
      .onFirstCall()
      .resolves({
        owner: true,
        admin: false,
        hasExtendedPermissions: false
      })
      .onSecondCall()
      .resolves({
        owner: true,
        admin: false,
        hasExtendedPermissions: false
      })

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'POST',
        body: JSON.stringify({
          admin: owner.authChain[0].payload
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })
})
