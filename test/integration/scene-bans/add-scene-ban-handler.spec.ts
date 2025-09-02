import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'
import { AuthLinkType } from '@dcl/crypto'

test('POST /scene-bans - adds ban for a user from a scene', ({ components, stubComponents }) => {
  const testPlaceId = `place-id-ban`

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

    stubComponents.lands.getLandPermissions.resolves({
      owner: true,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.worlds.hasWorldStreamingPermission.resolves(false)
    stubComponents.worlds.hasWorldDeployPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.isSceneOwner.resolves(false)
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)

    stubComponents.sceneBanManager.addBan.resolves()
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 204 when successfully adding a scene ban', async () => {
    const { localFetch } = components

    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({
          banned_address: admin.authChain[0].payload
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(204)
    expect(stubComponents.sceneBanManager.addBan.calledOnce).toBe(true)

    const addBanCall = stubComponents.sceneBanManager.addBan.getCall(0)
    expect(addBanCall.args[0]).toEqual({
      place_id: testPlaceId,
      banned_address: admin.authChain[0].payload.toLowerCase(),
      banned_by: owner.authChain[0].payload.toLowerCase()
    })
  })

  it('returns 204 when user has world streaming permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)

    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({
          banned_address: admin.authChain[0].payload
        }),
        metadata: metadataWorld
      },
      nonOwner
    )

    expect(response.status).toBe(204)
    expect(stubComponents.sceneBanManager.addBan.calledOnce).toBe(true)
  })

  it('returns 204 when user has operator permission', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandPermissions.resolves({
      owner: false,
      operator: true,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })

    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({
          banned_address: admin.authChain[0].payload
        }),
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(204)
    expect(stubComponents.sceneBanManager.addBan.calledOnce).toBe(true)
  })

  it('returns 401 when authentication is provided but invalid', async () => {
    const { localFetch } = components

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({ banned_address: admin.authChain[0].payload }),
        metadata: metadataLand
      },
      { ...owner, authChain: [...owner.authChain, { type: AuthLinkType.SIGNER, payload: 'invalid-signature' }] }
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/scene-bans', {
      method: 'POST'
    })

    expect(response.status).toBe(400)
  })

  it('returns 400 when banned_address is invalid', async () => {
    const { localFetch } = components

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({
          banned_address: 'invalid-address'
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 when banned_address is missing', async () => {
    const { localFetch } = components

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({}),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 401 when user is not owner or admin', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandPermissions.resolves({
      owner: false,
      operator: false,
      updateOperator: false,
      updateManager: false,
      approvedForAll: false
    })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(false)

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({
          banned_address: admin.authChain[0].payload
        }),
        metadata: metadataLand
      },
      nonOwner
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 when trying to ban an owner', async () => {
    const { localFetch } = components

    stubComponents.sceneManager.getUserScenePermissions
      .onFirstCall()
      .resolves({
        owner: true,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
      .onSecondCall()
      .resolves({
        owner: true,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({
          banned_address: owner.authChain[0].payload
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 when trying to ban an admin', async () => {
    const { localFetch } = components

    stubComponents.sceneManager.getUserScenePermissions
      .onFirstCall()
      .resolves({
        owner: false,
        admin: true,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
      .onSecondCall()
      .resolves({
        owner: false,
        admin: true,
        hasExtendedPermissions: false,
        hasLandLease: false
      })

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({
          banned_address: admin.authChain[0].payload
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 when trying to ban a user with extended permissions', async () => {
    const { localFetch } = components

    stubComponents.sceneManager.getUserScenePermissions
      .onFirstCall()
      .resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: true,
        hasLandLease: false
      })
      .onSecondCall()
      .resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: true,
        hasLandLease: false
      })

    const response = await makeRequest(
      localFetch,
      '/scene-bans',
      {
        method: 'POST',
        body: JSON.stringify({
          banned_address: admin.authChain[0].payload
        }),
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(400)
  })
})
