import { test } from '../components'
import { makeRequest, owner, nonOwner } from '../utils'
import { Room } from 'livekit-server-sdk'
import { PlaceAttributes } from '../../src/types/places.type'

type Metadata = {
  identity: string
  parcel: string
  sceneId: string
  realmName: string
}

test('POST /get-scene-adapter', ({ components, stubComponents }) => {
  const placeId = `place-id-comms-scene-ban-test`
  let metadata: Metadata

  beforeEach(async () => {
    metadata = {
      identity: owner.authChain[0].payload,
      realmName: 'test-realm',
      parcel: '10,20',
      sceneId: 'test-scene'
    }

    stubComponents.places.getPlaceByParcel.resolves({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)

    stubComponents.denyList.isDenylisted.resolves(false)
    stubComponents.userModeration.isPlayerBanned.resolves({ isBanned: false })
    stubComponents.livekit.getSceneRoomName.returns(`test-realm:test-scene`)
  })

  describe('when user is platform-banned', () => {
    beforeEach(() => {
      stubComponents.userModeration.isPlayerBanned.resolves({ isBanned: true })
    })

    it('should reject access returning 403', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/get-scene-adapter',
        {
          method: 'POST',
          metadata
        },
        nonOwner
      )

      expect(response.status).toBe(403)

      const body = await response.json()
      expect(body).toEqual({
        error: 'Access denied, platform-banned user'
      })
    })
  })

  describe('when the platform ban check fails', () => {
    beforeEach(() => {
      stubComponents.userModeration.isPlayerBanned.rejects(new Error('moderation service unavailable'))
      stubComponents.sceneBans.isUserBanned.resolves(false)
      stubComponents.livekit.generateCredentials.resolves({
        url: 'wss://test-livekit-url',
        token: 'test-token'
      })
      stubComponents.livekit.buildConnectionUrl.returns('livekit:wss://test-livekit-url?access_token=test-token')
    })

    it('should allow access (fail-open) returning 200', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/get-scene-adapter',
        {
          method: 'POST',
          metadata
        },
        owner
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({
        adapter: 'livekit:wss://test-livekit-url?access_token=test-token'
      })
    })
  })

  describe('when user is banned', () => {
    beforeEach(() => {
      stubComponents.sceneBans.isUserBanned.resolves(true)
    })

    it('should reject access returning 403', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/get-scene-adapter',
        {
          method: 'POST',
          metadata
        },
        nonOwner
      )

      expect(response.status).toBe(403)

      const body = await response.json()
      expect(body).toEqual({
        error: 'User is banned from this scene'
      })
    })
  })

  describe('when user is not banned', () => {
    beforeEach(() => {
      stubComponents.sceneBans.isUserBanned.resolves(false)
      stubComponents.livekit.generateCredentials.resolves({
        url: 'wss://test-livekit-url',
        token: 'test-token'
      })
      stubComponents.publisher.publishMessages.resolves({
        successfulMessageIds: ['test-message-id'],
        failedEvents: []
      })
      stubComponents.livekit.buildConnectionUrl.restore()
    })

    it('should return the livekit adapter', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/get-scene-adapter',
        {
          method: 'POST',
          metadata
        },
        owner
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({
        adapter: 'livekit:wss://test-livekit-url?access_token=test-token'
      })
    })
  })

  describe('when accessing a world', () => {
    let worldMetadata: Metadata

    beforeEach(() => {
      worldMetadata = {
        identity: owner.authChain[0].payload,
        realmName: 'test-world.eth',
        parcel: '10,20',
        sceneId: 'test-scene'
      }

      stubComponents.sceneBans.isUserBanned.resolves(false)
      stubComponents.livekit.getWorldRoomName.returns('test-world.eth')
      stubComponents.livekit.generateCredentials.resolves({
        url: 'wss://test-livekit-url',
        token: 'test-token'
      })
    })

    describe('when user does not have world access permission', () => {
      beforeEach(() => {
        stubComponents.worlds.hasWorldAccessPermission.resolves(false)
      })

      it('should reject access returning 401', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: worldMetadata
          },
          owner
        )

        expect(response.status).toBe(401)

        const body = await response.json()
        expect(body).toEqual({
          error: 'Access denied, you are not authorized to access this world'
        })
      })
    })

    describe('when user is the world owner', () => {
      beforeEach(() => {
        stubComponents.worlds.hasWorldAccessPermission.resolves(true)
      })

      it('should return the livekit adapter', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: worldMetadata
          },
          owner
        )

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          adapter: 'livekit:wss://test-livekit-url?access_token=test-token'
        })
      })
    })

    describe('when user is in the world access allowlist', () => {
      beforeEach(() => {
        stubComponents.worlds.hasWorldAccessPermission.resolves(true)
      })

      it('should return the livekit adapter', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: worldMetadata
          },
          nonOwner
        )

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          adapter: 'livekit:wss://test-livekit-url?access_token=test-token'
        })
      })
    })

    describe('when world has unrestricted access', () => {
      beforeEach(() => {
        stubComponents.worlds.hasWorldAccessPermission.resolves(true)
      })

      it('should return the livekit adapter for any user', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: worldMetadata
          },
          nonOwner
        )

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          adapter: 'livekit:wss://test-livekit-url?access_token=test-token'
        })
      })
    })

    describe('when client sends world name as sceneId', () => {
      let worldNameAsSceneIdMetadata: Metadata

      beforeEach(() => {
        worldNameAsSceneIdMetadata = {
          identity: owner.authChain[0].payload,
          realmName: 'test-world.eth',
          parcel: '10,20',
          sceneId: 'test-world.eth'
        }

        stubComponents.worlds.hasWorldAccessPermission.resolves(true)
      })

      describe('and the world about endpoint returns the scene ID', () => {
        beforeEach(() => {
          stubComponents.worlds.fetchWorldSceneId.resolves('bafkreiabcdef123')
          stubComponents.livekit.getWorldSceneRoomName.returns('world-prd-scene-room-test-world.eth-bafkreiabcdef123')
        })

        it('should fetch the real sceneId and use it for both the ban check and room name', async () => {
          const response = await makeRequest(
            components.localFetch,
            '/get-scene-adapter',
            {
              method: 'POST',
              metadata: worldNameAsSceneIdMetadata
            },
            owner
          )

          expect(response.status).toBe(200)
          expect(stubComponents.worlds.fetchWorldSceneId.calledWith('test-world.eth')).toBe(true)
          expect(stubComponents.sceneBans.isUserBanned.firstCall.args[1].sceneId).toBe('bafkreiabcdef123')
          expect(stubComponents.livekit.getWorldSceneRoomName.calledWith('test-world.eth', 'bafkreiabcdef123')).toBe(
            true
          )
        })
      })

      describe('and the world about endpoint fails', () => {
        beforeEach(() => {
          stubComponents.worlds.fetchWorldSceneId.rejects(new Error('HTTP 404'))
        })

        it('should return 400 without reaching the ban check', async () => {
          const response = await makeRequest(
            components.localFetch,
            '/get-scene-adapter',
            {
              method: 'POST',
              metadata: worldNameAsSceneIdMetadata
            },
            owner
          )

          expect(response.status).toBe(400)
          const body = await response.json()
          expect(body).toEqual({
            error: 'Failed to resolve scene ID for world test-world.eth'
          })
          expect(stubComponents.sceneBans.isUserBanned.called).toBe(false)
        })
      })

      describe('and the user is banned from the resolved world scene', () => {
        beforeEach(() => {
          stubComponents.worlds.fetchWorldSceneId.resolves('bafkreiabcdef123')
          stubComponents.sceneBans.isUserBanned.resolves(true)
        })

        it('should resolve the sceneId, detect the ban, and reject with 403', async () => {
          const response = await makeRequest(
            components.localFetch,
            '/get-scene-adapter',
            {
              method: 'POST',
              metadata: worldNameAsSceneIdMetadata
            },
            owner
          )

          expect(response.status).toBe(403)
          const body = await response.json()
          expect(body).toEqual({
            error: 'User is banned from this scene'
          })
          expect(stubComponents.worlds.fetchWorldSceneId.calledWith('test-world.eth')).toBe(true)
          expect(stubComponents.sceneBans.isUserBanned.firstCall.args[1].sceneId).toBe('bafkreiabcdef123')
          expect(stubComponents.worlds.hasWorldAccessPermission.called).toBe(false)
        })
      })
    })

    describe('when user is a scene admin', () => {
      let adminWorldMetadata: Metadata

      beforeEach(() => {
        adminWorldMetadata = {
          identity: owner.authChain[0].payload,
          realmName: 'test-world.eth',
          parcel: '10,20',
          sceneId: 'bafytest123'
        }

        stubComponents.worlds.hasWorldAccessPermission.resolves(true)
        stubComponents.livekit.getWorldSceneRoomName.returns('world-prd-scene-room-test-world.eth-bafytest123')
        stubComponents.places.getWorldByName.resolves({
          id: 'place-123',
          title: 'Test World',
          owner: owner.authChain[0].payload
        } as PlaceAttributes)
        stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(true)
        stubComponents.livekit.generateCredentials.resolves({
          url: 'wss://test-livekit-url',
          token: 'test-token'
        })
      })

      it('should add admin as presenter in room metadata', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: adminWorldMetadata
          },
          owner
        )

        expect(response.status).toBe(200)
        expect(stubComponents.livekit.appendToRoomMetadataArray.calledOnce).toBe(true)
        const appendCall = stubComponents.livekit.appendToRoomMetadataArray.firstCall
        expect(appendCall.args[0]).toBe('world-prd-scene-room-test-world.eth-bafytest123')
        expect(appendCall.args[1]).toBe('presenters')
        expect(appendCall.args[2]).toBe(owner.authChain[0].payload)
      })
    })

    describe('when user is NOT an admin', () => {
      let nonAdminWorldMetadata: Metadata

      beforeEach(() => {
        nonAdminWorldMetadata = {
          identity: nonOwner.authChain[0].payload,
          realmName: 'test-world.eth',
          parcel: '10,20',
          sceneId: 'bafytest123'
        }

        stubComponents.worlds.hasWorldAccessPermission.resolves(true)
        stubComponents.livekit.getWorldSceneRoomName.returns('world-prd-scene-room-test-world.eth-bafytest123')
        stubComponents.places.getWorldByName.resolves({
          id: 'place-123',
          title: 'Test World',
          owner: owner.authChain[0].payload
        } as PlaceAttributes)
        stubComponents.sceneManager.isSceneOwnerOrAdmin.resolves(false)
        stubComponents.livekit.generateCredentials.resolves({
          url: 'wss://test-livekit-url',
          token: 'test-token'
        })
      })

      it('should not add user as presenter', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: nonAdminWorldMetadata
          },
          nonOwner
        )

        expect(response.status).toBe(200)
        expect(stubComponents.livekit.appendToRoomMetadataArray.called).toBe(false)
      })
    })

    describe('when the admin check fails', () => {
      let failingMetadata: Metadata

      beforeEach(() => {
        failingMetadata = {
          identity: owner.authChain[0].payload,
          realmName: 'test-world.eth',
          parcel: '10,20',
          sceneId: 'bafytest123'
        }

        stubComponents.worlds.hasWorldAccessPermission.resolves(true)
        stubComponents.livekit.getWorldSceneRoomName.returns('world-prd-scene-room-test-world.eth-bafytest123')
        stubComponents.places.getWorldByName.rejects(new Error('Places API down'))
        stubComponents.livekit.generateCredentials.resolves({
          url: 'wss://test-livekit-url',
          token: 'test-token'
        })
      })

      it('should still return 200 (fail-open)', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: failingMetadata
          },
          owner
        )

        expect(response.status).toBe(200)
        expect(stubComponents.livekit.appendToRoomMetadataArray.called).toBe(false)
      })
    })

    describe('when client sends a content hash as sceneId', () => {
      let contentHashMetadata: Metadata

      beforeEach(() => {
        contentHashMetadata = {
          identity: owner.authChain[0].payload,
          realmName: 'test-world.eth',
          parcel: '10,20',
          sceneId: 'bafkreiabcdef123'
        }

        stubComponents.worlds.hasWorldAccessPermission.resolves(true)
        stubComponents.livekit.getWorldSceneRoomName.returns('world-prd-scene-room-test-world.eth-bafkreiabcdef123')
      })

      it('should use the sceneId as-is without fetching from the about endpoint', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: contentHashMetadata
          },
          owner
        )

        expect(response.status).toBe(200)
        expect(stubComponents.worlds.fetchWorldSceneId.called).toBe(false)
        expect(stubComponents.sceneBans.isUserBanned.firstCall.args[1].sceneId).toBe('bafkreiabcdef123')
        expect(stubComponents.livekit.getWorldSceneRoomName.calledWith('test-world.eth', 'bafkreiabcdef123')).toBe(true)
      })
    })
  })

  describe('when accessing a local preview realm', () => {
    let previewMetadata: Metadata

    beforeEach(() => {
      previewMetadata = {
        identity: owner.authChain[0].payload,
        realmName: 'LocalPreview',
        parcel: '10,20',
        sceneId: 'test-preview-scene'
      }

      stubComponents.livekit.isLocalPreview.returns(true)
      stubComponents.livekit.getSceneRoomName.returns('scene-LocalPreview:test-preview-scene')
      stubComponents.livekit.generateCredentials.resolves({
        url: 'wss://test-livekit-url',
        token: 'test-token'
      })
    })

    describe('and sceneId is provided', () => {
      it('should build the room name from the scene id and generate credentials with forPreview=false', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: previewMetadata
          },
          owner
        )

        expect(response.status).toBe(200)
        expect(stubComponents.livekit.getSceneRoomName.calledWith('LocalPreview', 'test-preview-scene')).toBe(true)
        expect(stubComponents.livekit.generateCredentials.firstCall.args[3]).toBe(false)
      })

      it('should skip the scene ban check', async () => {
        await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: previewMetadata
          },
          owner
        )

        expect(stubComponents.sceneBans.isUserBanned.called).toBe(false)
      })
    })

    describe('and sceneId is missing', () => {
      it('should reject the request returning 400', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/get-scene-adapter',
          {
            method: 'POST',
            metadata: {
              identity: owner.authChain[0].payload,
              realmName: 'LocalPreview',
              parcel: '10,20'
            }
          },
          owner
        )

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body).toEqual({
          error: 'Access denied, invalid signed-fetch request, no sceneId'
        })
      })
    })
  })
})
