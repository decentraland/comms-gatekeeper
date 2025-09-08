import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import { PlaceAttributes } from '../../../src/types/places.type'
import { AuthLinkType } from '@dcl/crypto'
import SQL from 'sql-template-strings'
import { createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'
import { UserScenePermissions } from '../../../src/types/scene-manager.type'

test('GET /scene-bans', ({ components, stubComponents }) => {
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

  beforeAll(async () => {
    cleanup = new TestCleanup(components.database)
  })

  beforeEach(async () => {
    // Generate unique place IDs for each test to avoid interference
    testPlaceId = `place-id-list-${Date.now()}-${Math.random()}`
    worldPlaceId = `world-place-id-list-${Date.now()}-${Math.random()}`

    userScenePermissions = {
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    }

    // Setup names mock
    stubComponents.names.getNamesFromAddresses.resolves({
      [admin.authChain[0].payload.toLowerCase()]: 'AdminUser#1234',
      [nonOwner.authChain[0].payload.toLowerCase()]: 'NonOwnerUser#5678',
      '0x1234567890123456789012345678901234567890': 'TestUser#9999'
    })

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

    mockedPlace = createMockedPlace({
      positions: [metadataLand.parcel],
      id: testPlaceId,
      world: false,
      title: 'Test Land Scene',
      owner: owner.authChain[0].payload
    })
    mockedWorldPlace = createMockedWorldPlace({
      id: worldPlaceId,
      world_name: 'name.dcl.eth',
      world: true,
      title: 'Test World',
      owner: owner.authChain[0].payload
    })

    stubComponents.places.getPlaceByParcel.resolves(mockedPlace)
    stubComponents.places.getPlaceByWorldName.resolves(mockedWorldPlace)
  })

  afterEach(async () => {
    await cleanup.cleanup()
  })

  describe('when user is land owner', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should successfully list bans for a land scene with no bans', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-bans?limit=20',
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

    it('should successfully list bans for a land scene with existing bans', async () => {
      const { localFetch } = components

      // Add some test bans
      const ban1 = await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (gen_random_uuid(), ${testPlaceId}, ${admin.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${Date.now()})
          RETURNING *
        `
      )
      const ban2 = await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (gen_random_uuid(), ${testPlaceId}, ${nonOwner.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${Date.now() + 1000})
          RETURNING *
        `
      )

      // Track for cleanup
      cleanup.trackInsert('scene_bans', { id: ban1.rows[0].id })
      cleanup.trackInsert('scene_bans', { id: ban2.rows[0].id })

      const response = await makeRequest(
        localFetch,
        '/scene-bans?limit=20',
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
      expect(body.results[0].bannedAddress).toBe(nonOwner.authChain[0].payload.toLowerCase()) // Most recent first
      expect(body.results[0].name).toBe('NonOwnerUser#5678')
      expect(body.results[1].bannedAddress).toBe(admin.authChain[0].payload.toLowerCase())
      expect(body.results[1].name).toBe('AdminUser#1234')
    })
  })

  describe('when user is scene admin', () => {
    beforeEach(async () => {
      // Add admin to database using real sceneAdminManager
      await components.sceneAdminManager.addAdmin({
        place_id: testPlaceId,
        admin: admin.authChain[0].payload,
        added_by: owner.authChain[0].payload
      })

      // Track the admin insert for cleanup
      const adminResult = await components.database.query(
        SQL`SELECT * FROM scene_admin WHERE place_id = ${testPlaceId} AND admin = ${admin.authChain[0].payload.toLowerCase()}`
      )
      if (adminResult.rows.length > 0) {
        cleanup.trackInsert('scene_admin', { id: adminResult.rows[0].id })
      }

      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should successfully list bans for a land scene', async () => {
      const { localFetch } = components

      // Add a test ban
      const ban = await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (gen_random_uuid(), ${testPlaceId}, ${nonOwner.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${Date.now()})
          RETURNING *
        `
      )
      cleanup.trackInsert('scene_bans', { id: ban.rows[0].id })

      const response = await makeRequest(
        localFetch,
        '/scene-bans?limit=20',
        {
          method: 'GET',
          metadata: metadataLand
        },
        admin
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.results).toHaveLength(1)
      expect(body.total).toBe(1)
      expect(body.page).toBe(1)
      expect(body.pages).toBe(1)
      expect(body.limit).toBe(20)
      expect(body.results[0].bannedAddress).toBe(nonOwner.authChain[0].payload.toLowerCase())
      expect(body.results[0].name).toBe('NonOwnerUser#5678')
    })
  })

  describe('when user is world owner', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should successfully list bans for a world', async () => {
      const { localFetch } = components

      // Add a test ban
      const ban = await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (gen_random_uuid(), ${worldPlaceId}, ${admin.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${Date.now()})
          RETURNING *
        `
      )
      cleanup.trackInsert('scene_bans', { id: ban.rows[0].id })

      const response = await makeRequest(
        localFetch,
        '/scene-bans?limit=20',
        {
          method: 'GET',
          metadata: metadataWorld
        },
        owner
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.results).toHaveLength(1)
      expect(body.total).toBe(1)
      expect(body.page).toBe(1)
      expect(body.pages).toBe(1)
      expect(body.limit).toBe(20)
      expect(body.results[0].bannedAddress).toBe(admin.authChain[0].payload.toLowerCase())
      expect(body.results[0].name).toBe('AdminUser#1234')
    })
  })

  describe('when user lacks permissions', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(false)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should return 401 for unauthorized user', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-bans',
        {
          method: 'GET',
          metadata: metadataLand
        },
        nonOwner
      )

      expect(response.status).toBe(401)
    })
  })

  describe('when authentication is invalid', () => {
    it('should return 401 for invalid auth chain', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-bans',
        {
          method: 'GET',
          metadata: metadataLand
        },
        { ...owner, authChain: [...owner.authChain, { type: AuthLinkType.SIGNER, payload: 'invalid-signature' }] }
      )

      expect(response.status).toBe(401)
    })

    it('should return 400 when no authentication is provided', async () => {
      const { localFetch } = components

      const response = await localFetch.fetch('/scene-bans', {
        method: 'GET'
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when listing bans with different sorting', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should return bans sorted by banned_at in descending order (most recent first)', async () => {
      const { localFetch } = components

      const now = Date.now()

      // Add bans with different timestamps
      const ban1 = await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (gen_random_uuid(), ${testPlaceId}, ${admin.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${now})
          RETURNING *
        `
      )
      const ban2 = await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (gen_random_uuid(), ${testPlaceId}, ${nonOwner.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${now + 2000})
          RETURNING *
        `
      )
      const ban3 = await components.database.query(
        SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (gen_random_uuid(), ${testPlaceId}, '0x1234567890123456789012345678901234567890', ${owner.authChain[0].payload.toLowerCase()}, ${now + 1000})
          RETURNING *
        `
      )

      // Track for cleanup
      cleanup.trackInsert('scene_bans', { id: ban1.rows[0].id })
      cleanup.trackInsert('scene_bans', { id: ban2.rows[0].id })
      cleanup.trackInsert('scene_bans', { id: ban3.rows[0].id })

      const response = await makeRequest(
        localFetch,
        '/scene-bans?limit=20',
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
      expect(body.results[0].bannedAddress).toBe(nonOwner.authChain[0].payload.toLowerCase())
      expect(body.results[0].name).toBe('NonOwnerUser#5678')
      expect(body.results[1].bannedAddress).toBe('0x1234567890123456789012345678901234567890')
      expect(body.results[1].name).toBe('TestUser#9999')
      expect(body.results[2].bannedAddress).toBe(admin.authChain[0].payload.toLowerCase())
      expect(body.results[2].name).toBe('AdminUser#1234')
    })
  })
})
