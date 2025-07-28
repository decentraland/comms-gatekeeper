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

    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)

    stubComponents.sceneAdmins.getAdminsAndExtraAddresses.resolves({
      admins: new Set(allAdminResults.filter((admin) => admin.canBeRemoved && 'id' in admin && 'place_id' in admin)),
      extraAddresses: new Set(allAdminResults.filter((admin) => !admin.canBeRemoved).map((admin) => admin.admin)),
      addresses: new Set(allAdminResults.map((admin) => admin.admin))
    })

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

    const mockAdmin1 = {
      id: '1',
      place_id: placeId,
      admin: admin.authChain[0].payload,
      added_by: owner.authChain[0].payload,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
      active: true,
      canBeRemoved: true,
      name: 'TestUser#1234'
    }

    const mockAdmin2 = {
      admin: nonOwner.authChain[0].payload,
      canBeRemoved: false,
      name: 'SirTest'
    }

    const expectedAdmins = [mockAdmin1, mockAdmin2]

    stubComponents.sceneAdmins.getAdminsAndExtraAddresses.resolves({
      admins: new Set([mockAdmin1]),
      extraAddresses: new Set([mockAdmin2.admin]),
      addresses: new Set([mockAdmin1.admin, mockAdmin2.admin])
    })

    stubComponents.names.getNamesFromAddresses.resolves({
      [admin.authChain[0].payload]: 'TestUser#1234',
      [nonOwner.authChain[0].payload]: 'SirTest'
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

    stubComponents.sceneAdmins.getAdminsAndExtraAddresses.resolves({
      admins: new Set(
        expectedAdmins.filter((admin) => 'id' in admin && 'place_id' in admin) as unknown as Set<SceneAdmin>
      ),
      extraAddresses: new Set(expectedAdmins.filter((admin) => !admin.canBeRemoved).map((admin) => admin.admin)),
      addresses: new Set(expectedAdmins.map((admin) => admin.admin))
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

    const mockAdmin1 = {
      id: '1',
      place_id: placeId,
      admin: admin.authChain[0].payload,
      added_by: owner.authChain[0].payload,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
      active: true,
      canBeRemoved: true,
      name: 'TestUser#1234'
    }

    const mockAdmin2 = {
      admin: nonOwner.authChain[0].payload,
      canBeRemoved: false,
      name: 'SirTest'
    }

    const expectedAdmins = [mockAdmin1, mockAdmin2]

    stubComponents.names.getNamesFromAddresses.resolves({
      [admin.authChain[0].payload]: 'TestUser#1234',
      [nonOwner.authChain[0].payload]: 'SirTest'
    })

    stubComponents.sceneAdmins.getAdminsAndExtraAddresses.resolves({
      admins: new Set([mockAdmin1]),
      extraAddresses: new Set([mockAdmin2.admin]),
      addresses: new Set([mockAdmin1.admin, mockAdmin2.admin])
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

  describe('when the user has land lease permission', () => {
    let testPlaceId: string
    let metadataLandLease: Metadata

    beforeEach(async () => {
      testPlaceId = 'place-id-land-lease'
      metadataLandLease = {
        identity: nonOwner.authChain[0].payload,
        parcel: '-73,50',
        sceneId: 'test-scene',
        realm: {
          serverName: 'test-realm',
          hostname: 'https://peer.decentraland.zone',
          protocol: 'v3'
        }
      }

      jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLandLease)

      stubComponents.places.getPlaceByParcel.resolves({
        positions: [metadataLandLease.parcel],
        id: testPlaceId,
        world: false
      } as PlaceAttributes)

      // User is not owner, admin, or has extended permissions
      stubComponents.lands.getLandPermissions.resolves({
        owner: false,
        operator: false,
        updateOperator: false,
        updateManager: false,
        approvedForAll: false
      })
      
      stubComponents.sceneManager.getUserScenePermissions.resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: true // User has land lease
      })
      
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true) // Should be true due to land lease
      
      stubComponents.sceneAdminManager.isAdmin.resolves(false)
      stubComponents.sceneManager.isSceneOwner.resolves(false)
      
      // Mock land lease component to return true for this user and parcel
      stubComponents.landLease.hasLandLease.resolves(true)

      stubComponents.sceneAdmins.getAdminsAndExtraAddresses.resolves({
        admins: new Set([
          {
            id: 'test-admin-id',
            place_id: testPlaceId,
            admin: '0x1234567890123456789012345678901234567890',
            added_by: owner.authChain[0].payload.toLowerCase(),
            active: true,
            created_at: Date.now()
          }
        ]),
        extraAddresses: new Set(),
        addresses: new Set(['0x1234567890123456789012345678901234567890'])
      })

      stubComponents.names.getNamesFromAddresses.resolves({
        '0x1234567890123456789012345678901234567890': 'Test User'
      })
    })

    it('should return 200 status with admin list', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-admin',
        {
          method: 'GET',
          metadata: metadataLandLease
        },
        nonOwner
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
    })
  })
})
