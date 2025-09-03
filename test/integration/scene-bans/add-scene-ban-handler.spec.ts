import { test } from '../../components'
import { makeRequest, owner, admin, nonOwner } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import * as handlersUtils from '../../../src/logic/utils'
import { PlaceAttributes } from '../../../src/types/places.type'
import { AuthLinkType } from '@dcl/crypto'
import { InvalidRequestError, UnauthorizedError } from '../../../src/types/errors'

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

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue({
      ...metadataLand,
      sceneId: 'test-scene',
      isWorlds: false
    })

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
    // Permission validation is now handled in the logic component
    stubComponents.sceneBans.addSceneBan.resolves()
  })

  afterEach(async () => {
    await cleanup.cleanup()
    jest.restoreAllMocks()
  })

  describe('when user has valid permissions', () => {
    describe('and user is scene owner', () => {
      beforeEach(() => {
        stubComponents.sceneManager.getUserScenePermissions.resolves({
          owner: false,
          admin: false,
          hasExtendedPermissions: false,
          hasLandLease: false
        })
        stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
      })

      it('should return 204 and add ban successfully', async () => {
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
        expect(stubComponents.sceneBans.addSceneBan.calledOnce).toBe(true)
      })
    })

    describe('and user has world streaming permission', () => {
      beforeEach(() => {
        jest.spyOn(handlersUtils, 'validate').mockResolvedValueOnce({
          ...metadataWorld,
          sceneId: 'test-scene',
          isWorlds: true
        })
        stubComponents.sceneManager.getUserScenePermissions.resolves({
          owner: false,
          admin: false,
          hasExtendedPermissions: false,
          hasLandLease: false
        })
      })

      it('should return 204 and add ban successfully', async () => {
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
          nonOwner
        )

        expect(response.status).toBe(204)
        expect(stubComponents.sceneBans.addSceneBan.calledOnce).toBe(true)
      })
    })

    describe('and user has operator permission', () => {
      beforeEach(() => {
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
      })

      it('should return 204 and add ban successfully', async () => {
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
        expect(stubComponents.sceneBans.addSceneBan.calledOnce).toBe(true)
      })
    })
  })

  describe('when authentication is invalid', () => {
    describe('and authentication is provided but invalid', () => {
      it('should return 401', async () => {
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
    })

    describe('and no authentication is provided', () => {
      it('should return 400', async () => {
        const { localFetch } = components

        const response = await localFetch.fetch('/scene-bans', {
          method: 'POST'
        })

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when request payload is invalid', () => {
    describe('and banned_address is invalid', () => {
      it('should return 400', async () => {
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
    })

    describe('and banned_address is missing', () => {
      it('should return 400', async () => {
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

  describe('when user lacks permissions', () => {
    describe('and user is not owner or admin', () => {
      beforeEach(() => {
        stubComponents.sceneBans.addSceneBan.rejects(
          new UnauthorizedError('You do not have permission to ban users from this place')
        )
      })

      it('should return 401', async () => {
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
      })
    })
  })

  describe('when trying to ban a user that cannot be banned', () => {
    beforeEach(() => {
      stubComponents.sceneBans.addSceneBan.rejects(new InvalidRequestError('Cannot ban this address'))
    })

    it('should return 400', async () => {
      const { localFetch } = components

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
  })
})
