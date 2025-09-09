import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import { PlaceAttributes } from '../../../src/types/places.type'
import SQL from 'sql-template-strings'
import { createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'

test('DELETE /scene-bans', ({ components, stubComponents }) => {
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

  beforeAll(async () => {
    cleanup = new TestCleanup(components.database)
  })

  beforeEach(async () => {
    // Generate unique place IDs for each test to avoid interference
    testPlaceId = `place-id-unban-${Date.now()}-${Math.random()}`
    worldPlaceId = `world-place-id-unban-${Date.now()}-${Math.random()}`

    metadataLand = {
      identity: owner.authChain[0].payload,
      parcel: '-9,-9',
      sceneId: 'test-scene',
      realm: {
        serverName: 'realm-test',
        hostname: 'localhost',
        protocol: 'v3'
      }
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      parcel: '',
      sceneId: 'test-world-scene',
      realm: {
        serverName: 'world-test',
        hostname: 'localhost',
        protocol: 'v3'
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
      world_name: metadataWorld.realm.serverName,
      world: true,
      title: 'Test World',
      owner: owner.authChain[0].payload
    })

    stubComponents.places.getPlaceByParcel.resolves(mockedPlace)
    stubComponents.places.getPlaceByWorldName.resolves(mockedWorldPlace)
    stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
    stubComponents.sceneBanManager.removeBan.resolves()
    stubComponents.livekit.getRoomName.returns('test-room-name')
    stubComponents.livekit.updateRoomMetadata.resolves()
    stubComponents.sceneBanManager.listBannedAddresses.resolves([])
  })

  afterEach(async () => {
    await cleanup.cleanup()
  })

  describe('when user is an owner or admin', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
    })

    describe('and is trying to unban a user from a land scene', () => {
      it('should successfully unban the user', async () => {
        const { localFetch } = components

        // First, add a ban to remove
        await components.database.query(
          SQL`
            INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
            VALUES (gen_random_uuid(), ${testPlaceId}, ${nonOwner.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${Date.now()})
          `
        )

        const response = await makeRequest(
          localFetch,
          '/scene-bans',
          {
            method: 'DELETE',
            body: JSON.stringify({
              banned_address: nonOwner.authChain[0].payload
            }),
            metadata: metadataLand
          },
          owner
        )

        expect(response.status).toBe(204)
      })
    })

    describe('and is trying to unban a user from a world scene', () => {
      it('should successfully unban the user', async () => {
        const { localFetch } = components

        // First, add a ban to remove
        await components.database.query(
          SQL`
          INSERT INTO scene_bans (id, place_id, banned_address, banned_by, banned_at)
          VALUES (gen_random_uuid(), ${worldPlaceId}, ${nonOwner.authChain[0].payload.toLowerCase()}, ${owner.authChain[0].payload.toLowerCase()}, ${Date.now()})
        `
        )

        const response = await makeRequest(
          localFetch,
          '/scene-bans',
          {
            method: 'DELETE',
            body: JSON.stringify({
              banned_address: nonOwner.authChain[0].payload
            }),
            metadata: metadataWorld
          },
          owner
        )

        expect(response.status).toBe(204)
      })
    })

    describe('when room metadata update fails', () => {
      beforeEach(async () => {
        stubComponents.livekit.updateRoomMetadata.rejects(new Error('Room metadata update failed'))
      })

      it('should not return error to avoid breaking the client flow', async () => {
        const { localFetch } = components

        const response = await makeRequest(
          localFetch,
          '/scene-bans',
          {
            method: 'DELETE',
            body: JSON.stringify({
              banned_address: nonOwner.authChain[0].payload
            }),
            metadata: metadataLand
          },
          owner
        )

        expect(response.status).toBe(204)
      })
    })
  })

  describe('when user is not owner or admin', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(false)
    })

    it('should return 401', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-bans',
        {
          method: 'DELETE',
          body: JSON.stringify({
            banned_address: nonOwner.authChain[0].payload
          }),
          metadata: metadataLand
        },
        nonOwner
      )

      expect(response.status).toBe(401)
    })
  })

  describe('when handling invalid requests', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
    })

    it('should return 400 for invalid banned_address', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-bans',
        {
          method: 'DELETE',
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
          method: 'DELETE',
          body: JSON.stringify({}),
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(400)
    })

    it('should return 400 for invalid request body', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-bans',
        {
          method: 'DELETE',
          body: 'invalid-json',
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(400)
    })

    it('should return 400 for missing authentication', async () => {
      const { localFetch } = components

      const response = await localFetch.fetch('/scene-bans', {
        method: 'DELETE',
        body: JSON.stringify({
          banned_address: nonOwner.authChain[0].payload
        })
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when unbanning a non-existent ban', () => {
    beforeEach(async () => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
    })

    it('should still return 204 (idempotent operation)', async () => {
      const { localFetch } = components

      // Don't add any ban to the database
      const response = await makeRequest(
        localFetch,
        '/scene-bans',
        {
          method: 'DELETE',
          body: JSON.stringify({
            banned_address: nonOwner.authChain[0].payload
          }),
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(204)
    })
  })
})
