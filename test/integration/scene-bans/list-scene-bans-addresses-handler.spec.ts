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

      // Clean up any existing bans before each test
      await components.database.query(SQL`DELETE FROM scene_bans WHERE place_id = ${testPlaceId}`)
    })

    it('should successfully list banned addresses for a scene', async () => {
      const { localFetch } = components

      // Add some test bans
      await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES 
            (gen_random_uuid(), ${testPlaceId}, ${admin.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${Date.now() - 1000}),
            (gen_random_uuid(), ${testPlaceId}, ${nonOwner.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${Date.now()})
          RETURNING *
        `
      )

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
      expect(body.results).toContain(admin.authChain[0].payload.toLowerCase())
      expect(body.results).toContain(nonOwner.authChain[0].payload.toLowerCase())
    })

    it('should return empty array when no bans exist', async () => {
      const { localFetch } = components

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

      // Add bans with different timestamps
      await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES 
            (gen_random_uuid(), ${testPlaceId}, '0x1234567890123456789012345678901234567890', ${owner.authChain[0].payload.toLowerCase()}, 1234567890),
            (gen_random_uuid(), ${testPlaceId}, ${admin.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, 1234567891),
            (gen_random_uuid(), ${testPlaceId}, ${nonOwner.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, 1234567892)
          RETURNING *
        `
      )

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

      // Clean up any existing bans before each test
      await components.database.query(SQL`DELETE FROM scene_bans WHERE place_id = ${worldPlaceId}`)
    })

    it('should successfully list banned addresses for a world', async () => {
      const { localFetch } = components

      // Add a test ban
      await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (gen_random_uuid(), ${worldPlaceId}, ${admin.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${Date.now()})
          RETURNING *
        `
      )

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
