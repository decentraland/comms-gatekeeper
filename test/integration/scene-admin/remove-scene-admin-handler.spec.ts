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

  type Metadata = {
    identity: string
    realmName: string
    parcel: string
    hostname: string
    sceneId: string
  }

  let metadataLand: Metadata

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
      console.error('Error al listar admins:', error)
    }

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: otherAdminAddress,
      added_by: ownerAddress
    })

    metadataLand = {
      identity: ownerAddress,
      realmName: 'test-realm',
      parcel: '10,20',
      hostname: 'https://peer.decentraland.zone',
      sceneId: 'test-scene'
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)
    stubComponents.places.getPlace.resolves({
      id: placeId,
      positions: ['10,20'],
      owner: ownerAddress
    } as PlaceAttributes)
    stubComponents.land.hasLandPermission.resolves(false)
    stubComponents.world.hasWorldStreamingPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(true)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 204 when successfully deactivating a scene admin', async () => {
    const { localFetch } = components

    stubComponents.land.hasLandPermission.resolves(true)

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

    stubComponents.land.hasLandPermission.resolves(false)
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

  it('returns 401 when trying to remove a non-existent admin', async () => {
    const { localFetch } = components

    stubComponents.land.hasLandPermission.resolves(true)
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

    expect(response.status).toBe(401)
  })

  it('returns 204 when trying to remove the owner', async () => {
    const { localFetch } = components

    stubComponents.sceneAdminManager.isAdmin.resolves(true)
    stubComponents.land.hasLandPermission.resolves(true)

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

    expect(response.status).toBe(204)
  })

  it('returns 401 when non-owner/non-admin tries to remove an admin', async () => {
    const { localFetch } = components

    stubComponents.land.hasLandPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)

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

    stubComponents.places.getPlace.resolves(null)

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

  it('returns 204 when owner tries to remove themselves', async () => {
    const { localFetch } = components

    stubComponents.land.hasLandPermission.resolves(true)

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
      owner
    )

    expect(response.status).toBe(204)
  })
})
