import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import { PlaceAttributes } from '../../../src/types/places.type'
import { AuthLinkType } from '@dcl/crypto'
import SQL from 'sql-template-strings'
import { createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'
import { UserScenePermissions } from '../../../src/types/scene-manager.type'

test('POST /scene-bans', ({ components, stubComponents }) => {
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
    testPlaceId = `place-id-ban-${Date.now()}-${Math.random()}`
    worldPlaceId = `world-place-id-ban-${Date.now()}-${Math.random()}`

    userScenePermissions = {
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    }

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

    stubComponents.livekit.removeParticipant.resolves()
    stubComponents.livekit.getRoomName.returns('test-room-name')
    stubComponents.livekit.updateRoomMetadata.resolves()
  })

  afterEach(async () => {
    await cleanup.cleanup()
  })

  describe('when user is land owner', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should successfully ban a user from a land scene', async () => {
      const { localFetch } = components

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

      // Verify ban was added to database
      const banResult = await components.database.query(
        SQL`SELECT * FROM scene_bans WHERE place_id = ${testPlaceId} AND banned_address = ${admin.authChain[0].payload.toLowerCase()}`
      )
      expect(banResult.rowCount).toBe(1)
      expect(banResult.rows[0].banned_by).toBe(owner.authChain[0].payload.toLowerCase())
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

    it('should successfully ban a user from a land scene', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-bans',
        {
          method: 'POST',
          body: JSON.stringify({
            banned_address: nonOwner.authChain[0].payload
          }),
          metadata: metadataLand
        },
        admin
      )

      expect(response.status).toBe(204)

      // Verify ban was added to database
      const banResult = await components.database.query(
        SQL`SELECT * FROM scene_bans WHERE place_id = ${testPlaceId} AND banned_address = ${nonOwner.authChain[0].payload.toLowerCase()}`
      )
      expect(banResult.rowCount).toBe(1)
      expect(banResult.rows[0].banned_by).toBe(admin.authChain[0].payload.toLowerCase())
    })
  })

  describe('when user has land operator permission', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should successfully ban a user from a land scene', async () => {
      const { localFetch } = components

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

      // Verify ban was added to database
      const banResult = await components.database.query(
        SQL`SELECT * FROM scene_bans WHERE place_id = ${testPlaceId} AND banned_address = ${admin.authChain[0].payload.toLowerCase()}`
      )
      expect(banResult.rowCount).toBe(1)
      expect(banResult.rows[0].banned_by).toBe(nonOwner.authChain[0].payload.toLowerCase())
    })
  })

  describe('when user is world owner', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should successfully ban a user from a world', async () => {
      const { localFetch } = components

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
        owner
      )

      expect(response.status).toBe(204)

      // Verify ban was added to database
      const banResult = await components.database.query(
        SQL`SELECT * FROM scene_bans WHERE place_id = ${worldPlaceId} AND banned_address = ${admin.authChain[0].payload.toLowerCase()}`
      )
      expect(banResult.rowCount).toBe(1)
      expect(banResult.rows[0].banned_by).toBe(owner.authChain[0].payload.toLowerCase())
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
          method: 'POST',
          body: JSON.stringify({
            banned_address: admin.authChain[0].payload
          }),
          metadata: metadataLand
        },
        nonOwner
      )

      expect(response.status).toBe(401)

      // Verify no ban was added to database
      const banResult = await components.database.query(SQL`SELECT * FROM scene_bans WHERE place_id = ${testPlaceId}`)
      expect(banResult.rowCount).toBe(0)
    })
  })

  describe('when trying to ban an already banned user', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)

      await makeRequest(
        components.localFetch,
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
    })

    it('should return a 204 without adding a new row to the database', async () => {
      const { localFetch } = components

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

      // Verify ban was added to database only once
      const banResult = await components.database.query(
        SQL`SELECT * FROM scene_bans WHERE place_id = ${testPlaceId} AND banned_address = ${admin.authChain[0].payload.toLowerCase()}`
      )
      expect(banResult.rowCount).toBe(1)
    })
  })

  describe('when room metadata update fails', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
      stubComponents.livekit.updateRoomMetadata.rejects(new Error('Room metadata update failed'))
    })

    it('should still save the ban in the database', async () => {
      const { localFetch } = components

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

      // Verify ban was still added to database
      const banResult = await components.database.query(
        SQL`SELECT * FROM scene_bans WHERE place_id = ${testPlaceId} AND banned_address = ${admin.authChain[0].payload.toLowerCase()}`
      )
      expect(banResult.rowCount).toBe(1)
      expect(banResult.rows[0].banned_by).toBe(owner.authChain[0].payload.toLowerCase())
    })
  })

  describe('when trying to ban a protected user', () => {
    beforeEach(async () => {
      // Add the user to be banned as an admin (protected user)
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
      userScenePermissions.admin = true
      stubComponents.sceneManager.getUserScenePermissions.resolves(userScenePermissions)
    })

    it('should return 400 when trying to ban an admin', async () => {
      const { localFetch } = components

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

      // Verify no ban was added to database
      const banResult = await components.database.query(
        SQL`SELECT * FROM scene_bans WHERE place_id = ${testPlaceId} AND banned_address = ${admin.authChain[0].payload.toLowerCase()}`
      )
      expect(banResult.rowCount).toBe(0)
    })
  })

  describe('when authentication is invalid', () => {
    it('should return 401 for invalid auth chain', async () => {
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

    it('should return 400 when no authentication is provided', async () => {
      const { localFetch } = components

      const response = await localFetch.fetch('/scene-bans', {
        method: 'POST'
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when request payload is invalid', () => {
    it('should return 400 for invalid banned_address', async () => {
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

    it('should return 400 for missing banned_address', async () => {
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
  })
})
