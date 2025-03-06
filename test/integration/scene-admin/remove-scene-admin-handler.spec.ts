import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import SQL from 'sql-template-strings'
import * as handlersUtils from '../../../src/controllers/handlers/utils'
import { PlaceAttributes } from '../../../src/types'
import { AuthLinkType } from '@dcl/crypto'

test('DELETE /scene-admin - removes administrator access for a scene', ({ components }) => {
  let cleanup: TestCleanup
  const placeId = 'place-id'

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
    cleanup = new TestCleanup(components.pg)

    const { sceneAdminManager } = components

    await sceneAdminManager.removeAdmin(placeId, adminAddress)

    await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: adminAddress,
      added_by: ownerAddress
    })

    const result = await sceneAdminManager.addAdmin({
      place_id: placeId,
      admin: otherAdminAddress,
      added_by: ownerAddress
    })

    cleanup.trackInsert('scene_admin', { id: result.id })

    metadataLand = {
      identity: ownerAddress,
      realmName: 'test-realm',
      parcel: '10,20',
      hostname: 'https://peer.decentraland.zone',
      sceneId: 'test-scene'
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)
    jest.spyOn(handlersUtils, 'getPlace').mockResolvedValue({
      id: placeId,
      positions: ['10,20'],
      owner: ownerAddress
    } as PlaceAttributes)
    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValue(false)
    jest.spyOn(handlersUtils, 'isPlaceAdmin').mockResolvedValue(false)
    jest.spyOn(handlersUtils, 'isValidAddress').mockReturnValue(true)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValue(true)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 204 when successfully deactivating a scene admin', async () => {
    const { localFetch, sceneAdminManager } = components

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(true).mockResolvedValueOnce(false)

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

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(handlersUtils, 'isPlaceAdmin').mockResolvedValueOnce(true)
    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(false)

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

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(true)
    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(false)
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

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(handlersUtils, 'isPlaceAdmin').mockResolvedValueOnce(true)

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(true)

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

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(false)

    jest.spyOn(handlersUtils, 'isPlaceAdmin').mockResolvedValueOnce(false)

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

    expect(response.status).toBe(400)
  })

  it('returns 400 when scene is not found', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'getPlace').mockResolvedValueOnce(null)

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

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(true)

    jest.spyOn(handlersUtils, 'hasLandPermission').mockResolvedValueOnce(true)

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
