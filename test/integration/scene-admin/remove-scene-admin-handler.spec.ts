import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'

test('DELETE /scene-admin - removes administrator access for a scene', ({ components, stubComponents }) => {
  const testPlaceId = `place-id-remove`
  let cleanup: TestCleanup
  const placeId = testPlaceId

  const adminAddress = admin.authChain[0].payload
  const ownerAddress = owner.authChain[0].payload
  const otherAdminAddress = '0x4444444444444444444444444444444444444444'
  const nonExistentAdminAddress = '0x5555555555555555555555555555555555555555'
  const operatorAddress = '0x6666666666666666666666666666666666666666'

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

  beforeEach(async () => {
    cleanup = new TestCleanup(components.database)

    const { sceneAdminManager } = components

    await sceneAdminManager.removeAdmin(placeId, adminAddress)
    await sceneAdminManager.removeAdmin(placeId, otherAdminAddress)

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: adminAddress,
      added_by: ownerAddress
    })

    try {
      const adminResults = await sceneAdminManager.listActiveAdmins({
        place_id: placeId
      })

      if (adminResults && Array.isArray(adminResults)) {
        adminResults.forEach((admin) => {
          if (admin && admin.id) {
            cleanup.trackInsert('scene_admin', { id: admin.id })
          }
        })
      }
    } catch (error) {
      console.error('Error listing admins:', error)
    }

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: otherAdminAddress,
      added_by: ownerAddress
    })

    metadataLand = {
      identity: ownerAddress,
      realm: {
        serverName: 'test-realm',
        hostname: 'https://peer.decentraland.zone',
        protocol: 'https'
      },
      sceneId: 'test-scene',
      parcel: '10,20'
    }

    metadataWorld = {
      identity: ownerAddress,
      realm: {
        serverName: 'test-world',
        hostname: 'https://worlds-content-server.decentraland.org',
        protocol: 'https'
      },
      sceneId: 'test-scene',
      parcel: '10,20'
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)
    stubComponents.places.getPlaceByParcel.resolves({
      id: placeId,
      positions: ['10,20'],
      owner: ownerAddress
    } as PlaceAttributes)

    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeId,
      positions: [],
      world_name: 'test-world',
      world: true,
      owner: ownerAddress
    } as PlaceAttributes)

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.worlds.hasWorldStreamingPermission.resolves(false)
    stubComponents.worlds.hasWorldDeployPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.resolveUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false
    })
    stubComponents.sceneManager.isSceneOwner.resolves(false)

    stubComponents.sceneAdminManager.removeAdmin.resolves()
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 204 when successfully deactivating a scene admin', async () => {
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
        admin: true,
        hasExtendedPermissions: false
      })

    stubComponents.sceneAdminManager.isAdmin.resolves(true)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          admin: adminAddress
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(204)
  })

  it('returns 204 when an admin removes another admin', async () => {
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

    stubComponents.sceneAdminManager.isAdmin.resolves(true)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          admin: otherAdminAddress
        }),
        metadata: metadataLand
      },
      admin
    )

    expect(response.status).toBe(204)
  })

  it('returns 400 when trying to remove a non-existent admin', async () => {
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

    stubComponents.sceneAdminManager.isAdmin.resolves(false)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          admin: nonExistentAdminAddress
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 when trying to remove the owner', async () => {
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
        owner: true,
        admin: false,
        hasExtendedPermissions: false
      })

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          admin: ownerAddress
        }),
        metadata: metadataLand
      },
      admin
    )

    expect(response.status).toBe(400)
  })

  it('returns 401 when non-owner/non-admin tries to remove an admin', async () => {
    const { localFetch } = components

    stubComponents.sceneManager.resolveUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false
    })

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          admin: adminAddress
        }),
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 when scene is not found', async () => {
    const { localFetch } = components

    stubComponents.places.getPlaceByParcel.resolves(null)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          admin: adminAddress
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 when payload is invalid', async () => {
    const { localFetch } = components

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          notAdmin: 'something'
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 when owner tries to remove themselves', async () => {
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

    stubComponents.sceneAdminManager.isAdmin.resolves(true)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          admin: ownerAddress
        }),
        metadata: {
          ...metadataLand,
          identity: ownerAddress
        }
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 when trying to remove a user with extended permissions', async () => {
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
        hasExtendedPermissions: true
      })

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          admin: operatorAddress
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 204 when world admin removes another admin', async () => {
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
        admin: true,
        hasExtendedPermissions: false
      })

    stubComponents.sceneAdminManager.isAdmin.resolves(true)

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'DELETE',
        body: JSON.stringify({
          admin: adminAddress
        }),
        metadata: metadataWorld
      },
      nonOwner
    )

    expect(response.status).toBe(204)
  })
})
