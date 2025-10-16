import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'
import { AuthLinkType } from '@dcl/crypto'
import { createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'

test('POST /scene-admin - adds administrator access for a scene who can add other admins', ({
  components,
  stubComponents
}) => {
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
    isWorld: boolean
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
    testPlaceId = `place-id-admin-${Date.now()}-${Math.random()}`
    worldPlaceId = `world-place-id-admin-${Date.now()}-${Math.random()}`

    metadataLand = {
      identity: owner.authChain[0].payload,
      parcel: '-9,-9',
      sceneId: 'test-scene',
      realm: {
        serverName: 'test-realm',
        hostname: 'https://peer.decentraland.zone',
        protocol: 'https'
      },
      isWorld: false
    }

    metadataWorld = {
      identity: owner.authChain[0].payload,
      parcel: '20,20',
      sceneId: 'test-scene',
      realm: {
        serverName: 'name.dcl.eth',
        hostname: 'https://worlds-content-server.decentraland.org/',
        protocol: 'https'
      },
      isWorld: true
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

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataLand)

    stubComponents.places.getPlaceByParcel.resolves(mockedPlace)
    stubComponents.places.getPlaceByWorldName.resolves(mockedWorldPlace)

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

    stubComponents.sceneAdminManager.addAdmin.resolves()
    stubComponents.sceneAdminManager.listActiveAdmins.resolves([
      {
        id: 'test-admin-id',
        place_id: testPlaceId,
        admin: admin.authChain[0].payload.toLowerCase(),
        added_by: owner.authChain[0].payload.toLowerCase(),
        active: true,
        created_at: Date.now()
      }
    ])
    stubComponents.names.getNameOwner.resolves(null)
    stubComponents.sceneBans.isUserBanned.resolves(false)
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  describe('when user is land owner', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
    })

    it('should successfully add a scene admin', async () => {
      const { localFetch } = components

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
      expect(stubComponents.sceneAdminManager.addAdmin.calledOnce).toBe(true)

      const result = await components.sceneAdminManager.listActiveAdmins({
        place_id: testPlaceId,
        admin: admin.authChain[0].payload
      })

      if (result.length > 0) {
        cleanup.trackInsert('scene_admin', { id: result[0].id })
      }

      expect(result.length).toBe(1)
      expect(result[0].active).toBe(true)
    })
  })

  describe('when user has world streaming permission', () => {
    beforeEach(() => {
      jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataWorld)
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
    })

    it('should successfully add a scene admin to a world', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            admin: admin.authChain[0].payload
          }),
          metadata: metadataWorld
        },
        nonOwner
      )

      expect(response.status).toBe(204)
      expect(stubComponents.sceneAdminManager.addAdmin.calledOnce).toBe(true)

      const result = await components.sceneAdminManager.listActiveAdmins({
        place_id: testPlaceId,
        admin: admin.authChain[0].payload
      })

      if (result.length > 0) {
        cleanup.trackInsert('scene_admin', { id: result[0].id })
      }

      expect(result.length).toBe(1)
      expect(result[0].active).toBe(true)
    })
  })

  describe('when user has land operator permission', () => {
    beforeEach(() => {
      stubComponents.lands.getLandPermissions.resolves({
        owner: false,
        operator: true,
        updateOperator: false,
        updateManager: false,
        approvedForAll: false
      })
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
    })

    it('should successfully add a scene admin', async () => {
      const { localFetch } = components

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

      expect(response.status).toBe(204)
      expect(stubComponents.sceneAdminManager.addAdmin.calledOnce).toBe(true)
    })
  })

  describe('when user lacks permissions', () => {
    beforeEach(() => {
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
    })

    it('should return 401 for unauthorized user', async () => {
      const { localFetch } = components

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
  })

  describe('when trying to add an admin who is already an admin', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
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
    })

    it('should return 400 when admin already exists', async () => {
      const { localFetch } = components

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
    })
  })

  describe('when trying to add a scene owner as admin', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
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
    })

    it('should return 400 when trying to add an owner as admin', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            admin: owner.authChain[0].payload
          }),
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(400)
    })
  })

  describe('when adding admin by Decentraland name', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
    })

    it('should successfully add a scene admin by name', async () => {
      const { localFetch } = components

      const testName = 'test-name.dcl.eth'
      const nameOwnerAddress = admin.authChain[0].payload

      stubComponents.names.getNameOwner.resolves(nameOwnerAddress)
      stubComponents.sceneAdminManager.listActiveAdmins.resolves([
        {
          id: 'test-admin-id',
          place_id: testPlaceId,
          admin: nameOwnerAddress.toLowerCase(),
          added_by: owner.authChain[0].payload.toLowerCase(),
          active: true,
          created_at: Date.now()
        }
      ])

      const response = await makeRequest(
        localFetch,
        '/scene-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            name: testName
          }),
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(204)
      expect(stubComponents.sceneAdminManager.addAdmin.calledOnce).toBe(true)
      expect(stubComponents.names.getNameOwner.calledWith(testName)).toBe(true)

      const result = await components.sceneAdminManager.listActiveAdmins({
        place_id: testPlaceId,
        admin: nameOwnerAddress
      })

      if (result.length > 0) {
        cleanup.trackInsert('scene_admin', { id: result[0].id })
      }

      expect(result.length).toBe(1)
      expect(result[0].active).toBe(true)
    })
  })

  describe('when adding admin by name that does not exist', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
      stubComponents.names.getNameOwner.resolves(null)
    })

    it('should return 404', async () => {
      const { localFetch } = components

      const testName = 'nonexistent-name.dcl.eth'

      const response = await makeRequest(
        localFetch,
        '/scene-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            name: testName
          }),
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(404)
      expect(stubComponents.names.getNameOwner.calledWith(testName)).toBe(true)
      expect(stubComponents.sceneAdminManager.addAdmin.called).toBe(false)
    })
  })

  describe('when both admin address and name are provided', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
    })

    it('should return 204 and prioritize admin address', async () => {
      const { localFetch } = components

      stubComponents.sceneAdminManager.listActiveAdmins.resolves([
        {
          id: 'test-admin-id',
          place_id: testPlaceId,
          admin: admin.authChain[0].payload.toLowerCase(),
          added_by: owner.authChain[0].payload.toLowerCase(),
          active: true,
          created_at: Date.now()
        }
      ])

      const response = await makeRequest(
        localFetch,
        '/scene-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            admin: admin.authChain[0].payload,
            name: 'test-name.dcl.eth'
          }),
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(204)
      expect(stubComponents.sceneAdminManager.addAdmin.calledOnce).toBe(true)
      expect(stubComponents.names.getNameOwner.called).toBe(false) // Should not call names service since admin is prioritized

      const result = await components.sceneAdminManager.listActiveAdmins({
        place_id: testPlaceId,
        admin: admin.authChain[0].payload
      })

      if (result.length > 0) {
        cleanup.trackInsert('scene_admin', { id: result[0].id })
      }

      expect(result.length).toBe(1)
      expect(result[0].active).toBe(true)
    })
  })

  describe('when authentication has invalid signature', () => {
    it('should return 401', async () => {
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
  })

  describe('when no authentication is provided', () => {
    it('should return 400', async () => {
      const { localFetch } = components

      const response = await localFetch.fetch('/scene-admin', {
        method: 'POST'
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when trying to add a banned user as admin', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
      stubComponents.sceneBans.isUserBanned.resolves(true)
    })

    it('should return 400 when admin is banned from the scene', async () => {
      const { localFetch } = components

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
      expect(stubComponents.sceneBans.isUserBanned.calledOnce).toBe(true)
      expect(stubComponents.sceneAdminManager.addAdmin.called).toBe(false)
    })

    it('should return 400 when admin by name is banned from the scene', async () => {
      const { localFetch } = components

      const testName = 'banned-user.dcl.eth'
      const nameOwnerAddress = admin.authChain[0].payload

      stubComponents.names.getNameOwner.resolves(nameOwnerAddress)
      stubComponents.sceneBans.isUserBanned.resolves(true)

      const response = await makeRequest(
        localFetch,
        '/scene-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            name: testName
          }),
          metadata: metadataLand
        },
        owner
      )

      expect(response.status).toBe(400)
      expect(stubComponents.names.getNameOwner.calledWith(testName)).toBe(true)
      expect(stubComponents.sceneBans.isUserBanned.calledOnce).toBe(true)
      expect(stubComponents.sceneAdminManager.addAdmin.called).toBe(false)
    })

    it('should check ban status with correct parameters for land scene', async () => {
      const { localFetch } = components

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

      expect(
        stubComponents.sceneBans.isUserBanned.calledWith(admin.authChain[0].payload.toLowerCase(), {
          sceneId: metadataLand.sceneId,
          parcel: metadataLand.parcel,
          realmName: metadataLand.realm.serverName,
          isWorld: false
        })
      ).toBe(true)
    })

    it('should check ban status with correct parameters for world scene', async () => {
      const { localFetch } = components

      jest.spyOn(handlersUtils, 'validate').mockResolvedValue(metadataWorld)

      await makeRequest(
        localFetch,
        '/scene-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            admin: admin.authChain[0].payload
          }),
          metadata: metadataWorld
        },
        owner
      )

      expect(
        stubComponents.sceneBans.isUserBanned.calledWith(admin.authChain[0].payload.toLowerCase(), {
          sceneId: metadataWorld.sceneId,
          parcel: metadataWorld.parcel,
          realmName: metadataWorld.realm.serverName,
          isWorld: true
        })
      ).toBe(true)
    })
  })

  describe('when trying to add a non-banned user as admin', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      stubComponents.sceneManager.getUserScenePermissions.resolves({
        owner: false,
        admin: false,
        hasExtendedPermissions: false,
        hasLandLease: false
      })
      stubComponents.sceneBans.isUserBanned.resolves(false)
      stubComponents.sceneAdminManager.listActiveAdmins.resolves([
        {
          id: 'test-admin-id',
          place_id: testPlaceId,
          admin: admin.authChain[0].payload.toLowerCase(),
          added_by: owner.authChain[0].payload.toLowerCase(),
          active: true,
          created_at: Date.now()
        }
      ])
    })

    it('should successfully add admin when user is not banned', async () => {
      const { localFetch } = components

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
      expect(stubComponents.sceneBans.isUserBanned.calledOnce).toBe(true)
      expect(stubComponents.sceneAdminManager.addAdmin.calledOnce).toBe(true)

      const result = await components.sceneAdminManager.listActiveAdmins({
        place_id: testPlaceId,
        admin: admin.authChain[0].payload
      })

      if (result.length > 0) {
        cleanup.trackInsert('scene_admin', { id: result[0].id })
      }

      expect(result.length).toBe(1)
      expect(result[0].active).toBe(true)
    })
  })

  describe('when request payload has invalid admin address', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
    })

    it('should return 400', async () => {
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
  })

  describe('when request payload has neither admin address nor name', () => {
    beforeEach(() => {
      stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
    })

    it('should return 400', async () => {
      const { localFetch } = components

      const response = await makeRequest(
        localFetch,
        '/scene-admin',
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
