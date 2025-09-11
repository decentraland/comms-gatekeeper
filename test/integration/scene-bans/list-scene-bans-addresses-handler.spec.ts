import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import { PlaceAttributes } from '../../../src/types/places.type'
import SQL from 'sql-template-strings'
import { createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'
import { UserScenePermissions } from '../../../src/types/scene-manager.type'

test('GET /scene-bans/addresses', ({ components, stubComponents }) => {
  let testPlaceId: string
  let worldPlaceId: string

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
  let mockedPlace: PlaceAttributes
  let mockedWorldPlace: PlaceAttributes
  let userScenePermissions: UserScenePermissions

  beforeEach(async () => {
    cleanup = new TestCleanup(components.database)

    mockedPlace = createMockedPlace()
    mockedWorldPlace = createMockedWorldPlace()

    testPlaceId = mockedPlace.id
    worldPlaceId = mockedWorldPlace.id

    metadataLand = {
      identity: owner.authChain[0].payload,
      parcel: '0,0',
      sceneId: 'test-scene-id',
      realm: {
        serverName: 'realm-1',
        hostname: 'localhost',
        protocol: 'v2'
      }
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      parcel: '',
      sceneId: 'test-world-scene-id',
      realm: {
        serverName: 'test-world.dcl.eth',
        hostname: 'localhost',
        protocol: 'v2'
      }
    }

    userScenePermissions = {
      owner: true,
      admin: true,
      hasExtendedPermissions: true,
      hasLandLease: true
    }

    stubComponents.places.getPlaceByParcel.resolves(mockedPlace)
    stubComponents.places.getPlaceByWorldName.resolves(mockedWorldPlace)
  })

  afterEach(async () => {
    await cleanup.cleanup()
  })

  describe('when user is scene owner', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should successfully list banned addresses for a scene', async () => {
      const { localFetch } = components

      // Add some test bans and track them for cleanup
      const ban1 = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        place_id: testPlaceId,
        banned_address: '0x1111111111111111111111111111111111111111',
        banned_by: owner.authChain[0].payload.toLowerCase(),
        banned_at: Date.now() - 1000
      }
      const ban2 = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        place_id: testPlaceId,
        banned_address: '0x2222222222222222222222222222222222222222',
        banned_by: owner.authChain[0].payload.toLowerCase(),
        banned_at: Date.now()
      }

      await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES 
            (${ban1.id}, ${ban1.place_id}, ${ban1.banned_address}, ${ban1.banned_by}, ${ban1.banned_at}),
            (${ban2.id}, ${ban2.place_id}, ${ban2.banned_address}, ${ban2.banned_by}, ${ban2.banned_at})
          RETURNING *
        `
      )

      // Track the bans for cleanup
      cleanup.trackInsert('scene_bans', ban1)
      cleanup.trackInsert('scene_bans', ban2)

      const response = await makeRequest(
        localFetch,
        '/scene-bans/addresses?limit=20',
        {
          method: 'GET',
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.results).toHaveLength(2)
      expect(body.total).toBe(2)
      expect(body.page).toBe(1)
      expect(body.pages).toBe(1)
      expect(body.limit).toBe(20)
      expect(body.results).toContain('0x1111111111111111111111111111111111111111')
      expect(body.results).toContain('0x2222222222222222222222222222222222222222')
    })

    it('should return empty array when no bans exist', async () => {
      const { localFetch } = components

      // Clean up any existing bans for this place to ensure empty state
      await components.database.query(SQL`DELETE FROM scene_bans WHERE place_id = ${testPlaceId}`)

      const response = await makeRequest(
        localFetch,
        '/scene-bans/addresses?limit=20',
        {
          method: 'GET',
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.results).toEqual([])
      expect(body.total).toBe(0)
      expect(body.page).toBe(1)
      expect(body.pages).toBe(0)
      expect(body.limit).toBe(20)
    })

    it('should return addresses sorted by banned_at DESC (most recent first)', async () => {
      const { localFetch } = components

      // Add bans with different timestamps and track them for cleanup
      const ban1 = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        place_id: testPlaceId,
        banned_address: '0x1234567890123456789012345678901234567890',
        banned_by: owner.authChain[0].payload.toLowerCase(),
        banned_at: 1234567890
      }
      const ban2 = {
        id: '550e8400-e29b-41d4-a716-446655440004',
        place_id: testPlaceId,
        banned_address: admin.authChain[0].payload.toLowerCase(),
        banned_by: owner.authChain[0].payload.toLowerCase(),
        banned_at: 1234567891
      }
      const ban3 = {
        id: '550e8400-e29b-41d4-a716-446655440005',
        place_id: testPlaceId,
        banned_address: nonOwner.authChain[0].payload.toLowerCase(),
        banned_by: owner.authChain[0].payload.toLowerCase(),
        banned_at: 1234567892
      }

      await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES 
            (${ban1.id}, ${ban1.place_id}, ${ban1.banned_address}, ${ban1.banned_by}, ${ban1.banned_at}),
            (${ban2.id}, ${ban2.place_id}, ${ban2.banned_address}, ${ban2.banned_by}, ${ban2.banned_at}),
            (${ban3.id}, ${ban3.place_id}, ${ban3.banned_address}, ${ban3.banned_by}, ${ban3.banned_at})
          RETURNING *
        `
      )

      // Track the bans for cleanup
      cleanup.trackInsert('scene_bans', ban1)
      cleanup.trackInsert('scene_bans', ban2)
      cleanup.trackInsert('scene_bans', ban3)

      const response = await makeRequest(
        localFetch,
        '/scene-bans/addresses?limit=20',
        {
          method: 'GET',
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.results).toHaveLength(3)
      expect(body.total).toBe(3)
      expect(body.page).toBe(1)
      expect(body.pages).toBe(1)
      expect(body.limit).toBe(20)

      // Should be sorted by banned_at DESC (most recent first)
      expect(body.results[0]).toBe(nonOwner.authChain[0].payload.toLowerCase())
      expect(body.results[1]).toBe(admin.authChain[0].payload.toLowerCase())
      expect(body.results[2]).toBe('0x1234567890123456789012345678901234567890')
    })
  })

  describe('when user is world owner', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should successfully list banned addresses for a world', async () => {
      const { localFetch } = components

      // Add a test ban and track it for cleanup
      const ban = {
        id: '550e8400-e29b-41d4-a716-446655440006',
        place_id: worldPlaceId,
        banned_address: admin.authChain[0].payload.toLowerCase(),
        banned_by: owner.authChain[0].payload.toLowerCase(),
        banned_at: Date.now()
      }

      await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (${ban.id}, ${ban.place_id}, ${ban.banned_address}, ${ban.banned_by}, ${ban.banned_at})
          RETURNING *
        `
      )

      // Track the ban for cleanup
      cleanup.trackInsert('scene_bans', ban)

      const response = await makeRequest(
        localFetch,
        '/scene-bans/addresses',
        {
          method: 'GET',
          metadata: metadataWorld
        },
        owner
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.results).toHaveLength(1)
      expect(body.results[0]).toBe(admin.authChain[0].payload.toLowerCase())
    })
  })

  describe('when user lacks permissions', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(false)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should return 401 when user is not owner or admin', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-bans/addresses',
        {
          method: 'GET',
          metadata: metadataLand
        },
        nonOwner
      )

      expect(response.status).toBe(401)
    })
  })

  describe('when user is not authenticated', () => {
    it('should return 401 when no authentication provided', async () => {
      const { localFetch } = components

      const response = await makeRequest(localFetch, '/scene-bans/addresses', {
        method: 'GET',
        metadata: metadataLand
      })

      expect(response.status).toBe(401)
    })
  })
})
