import { test } from '../../components'
import { makeRequest, owner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/controllers/handlers/utils'
import { PlaceAttributes } from '../../../src/types'
import { admin, nonOwner } from '../../utils'
import { AuthLinkType } from '@dcl/crypto'

test('POST /scene-admin - adds administrator access for a scene who can add other admins', ({ components }) => {
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

    jest.spyOn(components.sceneFetcher, 'getPlace').mockResolvedValue({
      positions: [metadataLand.parcel],
      id: testPlaceId
    } as PlaceAttributes)

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValue(true)

    jest.spyOn(components.sceneFetcher, 'hasWorldPermission').mockResolvedValue(false)
  })

  afterEach(async () => {
    await cleanup.cleanup()
  })

  it('returns 204 when successfully adding a scene admin', async () => {
    const { localFetch, sceneAdminManager } = components

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

    jest.spyOn(components.sceneFetcher, 'hasLandPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneFetcher, 'hasWorldPermission').mockResolvedValueOnce(false)
    jest.spyOn(components.sceneAdminManager, 'isAdmin').mockResolvedValueOnce(false)

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
    const { localFetch, sceneAdminManager } = components

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

    const result = await sceneAdminManager.listActiveAdmins({
      place_id: testPlaceId,
      admin: admin.authChain[0].payload
    })

    if (result.length > 0) {
      cleanup.trackInsert('scene_admin', { id: result[0].id })
    }
  })
})
