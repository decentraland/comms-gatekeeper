import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types'

test('DELETE /scene-admin - removes administrator access for a scene', ({ components }) => {
  const testPlaceId = `place-id-remove`
  let cleanup: TestCleanup
  const placeId = testPlaceId

  const adminAddress = admin.authChain[0].payload
  const ownerAddress = owner.authChain[0].payload
  const otherAdminAddress = '0x4444444444444444444444444444444444444444'
  const nonExistentAdminAddress = '0x5555555555555555555555555555555555555555'

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

  beforeEach(async () => {
    cleanup = new TestCleanup(components.database)

    const { sceneAdminManager } = components

    await sceneAdminManager.removeAdmin(placeId, adminAddress)

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: adminAddress,
      added_by: ownerAddress
    })

    const adminResults = await sceneAdminManager.listActiveAdmins({
      place_id: placeId,
      admin: adminAddress
    })

    if (adminResults.length > 0) {
      cleanup.trackInsert('scene_admin', { id: adminResults[0].id })
    }

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: otherAdminAddress,
      added_by: ownerAddress
    })

    const otherAdminResults = await sceneAdminManager.listActiveAdmins({
      place_id: placeId,
      admin: otherAdminAddress
    })

    if (otherAdminResults.length > 0) {
      cleanup.trackInsert('scene_admin', { id: otherAdminResults[0].id })
    }

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

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)
    jest.spyOn(components.sceneFetcher, 'getPlace').mockResolvedValue({
      id: placeId,
      positions: ['10,20'],
      owner: ownerAddress
    } as PlaceAttributes)
    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValue(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValue(true)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 204 when successfully deactivating a scene admin', async () => {
    const { localFetch, sceneAdminManager } = components

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(true).mockResolvedValueOnce(false)

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

  it('allows an admin to remove another admin', async () => {
    const { localFetch } = components

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(true)
    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)

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

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(true)
    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(false)

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

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(true)

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(true)

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

  it('returns 403 when non-owner/non-admin tries to remove an admin', async () => {
    const { localFetch } = components

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(false)

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

    jest.spyOn(components.sceneFetcher, 'getPlace').mockResolvedValueOnce(null)

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

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(true)

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(true)

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

    expect(response.status).toBe(400)
  })
})
