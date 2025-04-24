import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'
import { PlaceNotFoundError } from '../../../src/types/errors'
import { SceneAdmin } from '../../../src/types'
import { PermissionType } from '../../../src/types/worlds.type'

type SceneAdminWithName = SceneAdmin & { name: string; canBeRemoved: boolean; updated_at: number }

test('GET /scene-admin - lists all active administrators for scenes', ({ components, stubComponents }) => {
  let cleanup: TestCleanup
  const placeId = `place-id-list`
  const placeId2 = `place-id-list-2`
  type Metadata = {
    identity: string
    sceneId: string
    parcel: string
    realm: {
      serverName: string
      hostname: string
      protocol: string
    }
  }

  let metadataLand: Metadata
  let metadataWorld: Metadata
  let adminResults: SceneAdmin[]
  let adminResults2: SceneAdmin[]
  let allAdminResults: SceneAdminWithName[]

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
      allAdminResults.push({
        ...adminResults[0],
        name: '',
        canBeRemoved: true,
        updated_at: Date.now()
      })
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
      allAdminResults.push({
        ...adminResults2[0],
        name: 'SirTest',
        canBeRemoved: true,
        updated_at: Date.now()
      })
      cleanup.trackInsert('scene_admin', { id: adminResults2[0].id })
    }

    metadataLand = {
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'test-realm',
        hostname: 'https://peer.decentraland.zone',
        protocol: 'https'
      },
      sceneId: 'test-scene',
      parcel: '10,20'
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      realm: {
        serverName: 'name.dcl.eth',
        hostname: 'https://worlds-content-server.decentraland.org/',
        protocol: 'https'
      },
      sceneId: 'test-scene',
      parcel: '20,20'
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

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.worlds.hasWorldStreamingPermission.resolves(false)
    stubComponents.worlds.hasWorldDeployPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)

    stubComponents.sceneAdminManager.listActiveAdmins.resolves(allAdminResults)

    stubComponents.names.getNamesFromAddresses.resolves({
      [admin.authChain[0].payload]: '',
      [nonOwner.authChain[0].payload]: 'SirTest'
    })
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  it('returns 200 with a list of scene admins when user has land permission', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })

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
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })

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
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: true
    })

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

  it('returns 200 with a list of scene admins when user has world deploy permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeId,
      world_name: 'name.dcl.eth',
      world: true
    } as PlaceAttributes)

    stubComponents.worlds.hasWorldDeployPermission.resolves(true)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: true
    })

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
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: true,
      hasExtendedPermissions: false
    })

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

    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })

    const response = await makeRequest(
      localFetch,
      '/scene-admin?admin=' + admin.authChain[0].payload,
      {
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(200)
  })

  it('returns 401 when user is not authorized', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.sceneAdminManager.isAdmin.resolves(false)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: false
    })
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(false)

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

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })

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

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.worlds.hasWorldOwnerPermission.resolves(true)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })

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
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: true
    })

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

  it('returns 200 with a list of scene admins when user has world deploy permission', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeId,
      world_name: 'name.dcl.eth',
      world: true
    } as PlaceAttributes)

    stubComponents.worlds.hasWorldDeployPermission.resolves(true)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: false,
      admin: false,
      hasExtendedPermissions: true
    })

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

  it('returns 200 with a list of scene admins when user has unclaimed name', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })

    const mockAdmin1 = {
      id: '1',
      place_id: placeId,
      admin: admin.authChain[0].payload,
      added_by: owner.authChain[0].payload,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
      active: true,
      canBeRemoved: true
    }

    const mockAdmin2 = {
      id: '2',
      place_id: placeId,
      admin: nonOwner.authChain[0].payload,
      added_by: owner.authChain[0].payload,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
      active: true,
      canBeRemoved: true
    }

    stubComponents.names.getNamesFromAddresses.resolves({
      [admin.authChain[0].payload]: 'TestUser#1234',
      [nonOwner.authChain[0].payload]: 'SirTest'
    })

    const expectedAdmins = [
      { ...mockAdmin1, name: 'TestUser#1234' },
      { ...mockAdmin2, name: 'SirTest' }
    ]

    stubComponents.sceneAdminManager.listActiveAdmins.resolves(expectedAdmins)

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
    expect(body).toEqual(expectedAdmins)
  })

  it('returns 200 with a list of scene admins including addresses from world permissions', async () => {
    const { localFetch } = components

    const extraAddress1 = '0x1111111111111111111111111111111111111111'
    const extraAddress2 = '0x2222222222222222222222222222222222222222'

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeId,
      world_name: 'name.dcl.eth',
      world: true
    } as PlaceAttributes)

    stubComponents.worlds.fetchWorldActionPermissions.resolves({
      permissions: {
        deployment: {
          type: PermissionType.AllowList,
          wallets: [extraAddress1]
        },
        streaming: {
          type: PermissionType.AllowList,
          wallets: [extraAddress2]
        },
        access: {
          type: PermissionType.AllowList,
          wallets: []
        }
      },
      owner: '0xUserAddress'
    })

    stubComponents.names.getNamesFromAddresses.resolves({
      [admin.authChain[0].payload]: '',
      [nonOwner.authChain[0].payload]: 'SirTest',
      [extraAddress1]: 'ExtraUser1',
      [extraAddress2]: 'ExtraUser2'
    })

    const expectedAdmins = [
      ...allAdminResults.map((admin) => ({
        ...admin,
        canBeRemoved: true
      })),
      {
        admin: extraAddress1,
        name: 'ExtraUser1',
        canBeRemoved: false
      },
      {
        admin: extraAddress2,
        name: 'ExtraUser2',
        canBeRemoved: false
      },
      {
        admin: '0xuseraddress',
        canBeRemoved: false,
        name: ''
      }
    ]

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
    expect(body).toEqual(expectedAdmins)
  })

  it('returns 200 with a list of scene admins where some cannot be removed due to world permissions', async () => {
    const { localFetch } = components

    jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce(metadataWorld)
    stubComponents.places.getPlaceByWorldName.resolves({
      id: placeId,
      world_name: 'name.dcl.eth',
      world: true
    } as PlaceAttributes)

    stubComponents.worlds.hasWorldOwnerPermission.resolves(true)
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })

    const mockAdmin1 = {
      id: '1',
      place_id: placeId,
      admin: admin.authChain[0].payload,
      added_by: owner.authChain[0].payload,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
      active: true
    }

    const mockAdmin2 = {
      id: '2',
      place_id: placeId,
      admin: nonOwner.authChain[0].payload,
      added_by: owner.authChain[0].payload,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
      active: true
    }

    stubComponents.names.getNamesFromAddresses.resolves({
      [admin.authChain[0].payload]: 'TestUser#1234',
      [nonOwner.authChain[0].payload]: 'SirTest'
    })

    const expectedAdmins = [
      { ...mockAdmin1, name: 'TestUser#1234', canBeRemoved: true },
      { admin: mockAdmin2.admin, name: 'SirTest', canBeRemoved: false },
      {
        admin: '0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd',
        canBeRemoved: false,
        name: ''
      }
    ]

    stubComponents.sceneAdmins.getAdminsAndExtraAddresses.resolves({
      admins: new Set([mockAdmin1]),
      extraAddresses: new Set([mockAdmin2.admin, '0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd']),
      addresses: new Set([mockAdmin1.admin, mockAdmin2.admin, '0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd'])
    })

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
    expect(body).toEqual(expectedAdmins)
  })

  it('returns 200 with a list of scene admins including land operators', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })

    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })

    stubComponents.sceneAdmins.getAdminsAndExtraAddresses.resolves({
      admins: new Set([]),
      extraAddresses: new Set(['0xOwnerAddress', '0xOperatorAddress']),
      addresses: new Set([admin.authChain[0].payload, '0xOwnerAddress', '0xOperatorAddress'])
    })

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
    expect(body).toEqual([
      { admin: '0xOwnerAddress', canBeRemoved: false, name: '' },
      { admin: '0xOperatorAddress', canBeRemoved: false, name: '' }
    ])
    expect(stubComponents.sceneAdmins.getAdminsAndExtraAddresses.calledOnce).toBe(true)
  })

  it('returns 200 with a list of scene admins including only land owner when no operator exists', async () => {
    const { localFetch } = components

    stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
    stubComponents.sceneManager.getUserScenePermissions.resolves({
      owner: true,
      admin: false,
      hasExtendedPermissions: false
    })

    stubComponents.sceneAdmins.getAdminsAndExtraAddresses.resolves({
      admins: new Set([]),
      extraAddresses: new Set(['0xOwnerAddress']),
      addresses: new Set([admin.authChain[0].payload, '0xOwnerAddress'])
    })

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
    expect(body).toEqual([
      {
        admin: '0xOwnerAddress',
        canBeRemoved: false,
        name: ''
      }
    ])
    expect(stubComponents.sceneAdmins.getAdminsAndExtraAddresses.calledOnce).toBe(true)
  })

  it('returns 500 when getAdminsAndExtraAddresses request fails', async () => {
    const { localFetch } = components

    stubComponents.sceneAdmins.getAdminsAndExtraAddresses.rejects(new Error('Failed to get admins and extra addresses'))

    const response = await makeRequest(
      localFetch,
      '/scene-admin',
      {
        method: 'GET',
        metadata: metadataLand
      },
      owner
    )

    expect(response.status).toBe(500)
    expect(stubComponents.sceneAdmins.getAdminsAndExtraAddresses.calledOnce).toBe(true)
  })
})
