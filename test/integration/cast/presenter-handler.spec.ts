import SQL from 'sql-template-strings'
import { Room } from 'livekit-server-sdk'
import { createMockedWorldPlace } from '../../mocks/places-mock'
import { test } from '../../components'
import { makeRequest, owner } from '../../utils'
import { ServiceUnavailableError } from '../../../src/types/errors'
import { NotSceneAdminError } from '../../../src/logic/cast/errors'

test('Cast: Presenter Handlers', function ({ components, spyComponents }) {
  const validAddress = '0x1234567890abcdef1234567890abcdef12345678'

  const metadata = {
    sceneId: 'bafytest123',
    realm: {
      serverName: 'fenrir',
      hostname: 'https://peer.decentraland.zone',
      protocol: 'https'
    },
    parcel: '10,20'
  }

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when a world stream still uses a legacy mixed-case room', () => {
    let worldMetadata: typeof metadata
    let canonicalRoom: string

    beforeEach(async () => {
      worldMetadata = {
        ...metadata,
        sceneId: 'SCENE',
        realm: {
          ...metadata.realm,
          serverName: 'MyWorld.eth',
          hostname: 'https://worlds-content-server.decentraland.org'
        }
      }
      spyComponents.worlds.resolveWorldSceneId.mockRejectedValue(new ServiceUnavailableError('Worlds unavailable'))
      canonicalRoom = components.livekit.getWorldSceneRoomName('MyWorld.eth', 'SCENE')
      await components.sceneStreamAccessManager.addAccess({
        place_id: 'test-presenter-world',
        room_id: canonicalRoom.replace('myworld.eth-scene', 'MyWorld.eth-SCENE'),
        ingress_id: 'test-presenter-world-ingress',
        streaming_key: 'test-presenter-world-key',
        streaming_url: 'rtmp://test',
        expiration_time: Date.now() + 60000
      })
      spyComponents.places.getPlaceStatusByIds.mockResolvedValueOnce([
        createMockedWorldPlace({ id: 'test-presenter-world', world_name: 'myworld.eth' })
      ])
      spyComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValueOnce(true)
      spyComponents.livekit.getRoomInfo.mockResolvedValueOnce(
        new Room({ metadata: JSON.stringify({ presenters: [validAddress] }) })
      )
    })

    afterEach(async () => {
      await components.database.query(SQL`DELETE FROM scene_stream_access WHERE place_id = 'test-presenter-world'`)
    })

    it('should authorize and list presenters through the real room parser and database lookup', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/cast/presenters',
        { method: 'GET', metadata: worldMetadata },
        owner
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ presenters: [validAddress] })
      expect(spyComponents.sceneManager.isSceneOwnerOrAdmin).toHaveBeenCalled()
      expect(spyComponents.livekit.getRoomInfo).toHaveBeenCalledWith(canonicalRoom)
    })
  })

  describe.each(['GET', 'PUT', 'DELETE'])('when %s targets a previous world room', (method) => {
    let worldMetadata: typeof metadata
    let roomId: string
    let path: string

    beforeEach(async () => {
      worldMetadata = {
        ...metadata,
        sceneId: 'previous-deployment',
        parcel: '99,99',
        realm: { ...metadata.realm, serverName: 'presenters.eth', hostname: 'https://worlds-content-server.org' }
      }
      path = method === 'GET' ? '/cast/presenters' : `/cast/presenters/${validAddress}`
      roomId = components.livekit.getWorldSceneRoomName('presenters.eth', 'previous-deployment')
      await components.sceneStreamAccessManager.addAccess({
        place_id: 'previous-presenter-place',
        room_id: roomId,
        ingress_id: 'previous-presenter-ingress',
        streaming_key: 'previous-presenter-key',
        streaming_url: 'rtmp://test',
        expiration_time: Date.now() + 60000
      })
      spyComponents.worlds.resolveWorldSceneId.mockRejectedValue(new ServiceUnavailableError('Worlds unavailable'))
      spyComponents.places.getPlaceStatusByIds.mockResolvedValue([
        createMockedWorldPlace({ id: 'previous-presenter-place', world_name: 'presenters.eth' })
      ])
      spyComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
      spyComponents.livekit.getRoomInfo.mockResolvedValue(new Room({ metadata: '{"presenters":[]}' }))
      spyComponents.livekit.getRoom.mockResolvedValue(new Room())
      spyComponents.livekit.appendToRoomMetadataArray.mockResolvedValue(undefined)
      spyComponents.livekit.removeFromRoomMetadataArray.mockResolvedValue(undefined)
    })

    afterEach(async () => {
      await components.database.query(SQL`DELETE FROM scene_stream_access WHERE place_id = 'previous-presenter-place'`)
    })

    it('should use the stored room place despite an unrelated parcel and unavailable world lookup', async () => {
      const response = await makeRequest(components.localFetch, path, { method, metadata: worldMetadata }, owner)
      expect(response.status).toBe(200)
      expect(spyComponents.places.getPlaceStatusByIds).toHaveBeenCalledWith(['previous-presenter-place'])
      expect(spyComponents.worlds.resolveWorldSceneId).not.toHaveBeenCalled()
    })

    describe('and the caller is not an admin of the stored place', () => {
      beforeEach(() => {
        spyComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should reject access to the selected room', async () => {
        const response = await makeRequest(components.localFetch, path, { method, metadata: worldMetadata }, owner)
        expect(response.status).toBe(403)
        expect(spyComponents.livekit.appendToRoomMetadataArray).not.toHaveBeenCalled()
        expect(spyComponents.livekit.removeFromRoomMetadataArray).not.toHaveBeenCalled()
      })
    })

    describe('and the scene ID is a legacy world name', () => {
      beforeEach(() => {
        worldMetadata.sceneId = 'presenters.eth'
        spyComponents.worlds.resolveWorldSceneId.mockResolvedValue('previous-deployment')
      })

      it('should resolve the legacy identity before authorizing the stored room', async () => {
        const response = await makeRequest(components.localFetch, path, { method, metadata: worldMetadata }, owner)
        expect(response.status).toBe(200)
        expect(spyComponents.worlds.resolveWorldSceneId).toHaveBeenCalledWith(
          'presenters.eth',
          'presenters.eth',
          '99,99'
        )
        expect(spyComponents.places.getPlaceStatusByIds).toHaveBeenCalledWith(['previous-presenter-place'])
      })
    })
  })

  describe('when getting presenters', () => {
    describe('and the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.getPresenters.mockResolvedValueOnce({
          presenters: [validAddress]
        })
      })

      it('should respond with 200 and the presenters list', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters',
          { method: 'GET', metadata },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.presenters).toEqual([validAddress])
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.getPresenters.mockRejectedValueOnce(new NotSceneAdminError())
      })

      it('should respond with 403', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters',
          { method: 'GET', metadata },
          owner
        )

        expect(response.status).toBe(403)
      })
    })
  })

  describe('when promoting a presenter', () => {
    describe('and the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockResolvedValueOnce(undefined)
      })

      it('should respond with 200 and a success message', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${validAddress}`,
          { method: 'PUT', metadata },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.message).toBe('Participant promoted to presenter')
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockRejectedValueOnce(new NotSceneAdminError())
      })

      it('should respond with 403', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${validAddress}`,
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(403)
      })
    })

    describe('and the participantIdentity is a valid streamer identity', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockResolvedValueOnce(undefined)
      })

      it('should respond with 200', async () => {
        const streamerIdentity = 'stream:place-123:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${encodeURIComponent(streamerIdentity)}`,
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(200)
      })
    })

    describe('and the streamer identity contains a room id with colons', () => {
      beforeEach(() => {
        spyComponents.cast.promotePresenter.mockResolvedValueOnce(undefined)
      })

      it('should respond with 200', async () => {
        const streamerIdentity = 'stream:scene:localpreview:bafytest:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${encodeURIComponent(streamerIdentity)}`,
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(200)
      })
    })

    describe('and the participantIdentity is a watcher identity', () => {
      it('should respond with 400', async () => {
        const watcherIdentity = 'watch:room-123:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${encodeURIComponent(watcherIdentity)}`,
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(400)
      })
    })

    describe('and the participantIdentity is a presentation bot identity', () => {
      it('should respond with 400', async () => {
        const botIdentity = 'presentation-bot:room-123:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${encodeURIComponent(botIdentity)}`,
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(400)
      })
    })

    describe('and the participantIdentity is not a valid identity format', () => {
      it('should respond with 400', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters/not-an-address',
          { method: 'PUT', metadata },
          owner
        )

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when demoting a presenter', () => {
    describe('and the caller is a scene admin', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockResolvedValueOnce(undefined)
      })

      it('should respond with 200 and a success message', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${validAddress}`,
          { method: 'DELETE', metadata },
          owner
        )

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.message).toBe('Participant demoted from presenter')
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockRejectedValueOnce(new NotSceneAdminError())
      })

      it('should respond with 403', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${validAddress}`,
          { method: 'DELETE', metadata },
          owner
        )

        expect(response.status).toBe(403)
      })
    })

    describe('and the participantIdentity is a valid streamer identity', () => {
      beforeEach(() => {
        spyComponents.cast.demotePresenter.mockResolvedValueOnce(undefined)
      })

      it('should respond with 200', async () => {
        const streamerIdentity = 'stream:place-123:a1b2c3d4-e5f6-7890-abcd-ef1234567890'
        const response = await makeRequest(
          components.localFetch,
          `/cast/presenters/${encodeURIComponent(streamerIdentity)}`,
          { method: 'DELETE', metadata },
          owner
        )

        expect(response.status).toBe(200)
      })
    })

    describe('and the participantIdentity is not a valid identity format', () => {
      it('should respond with 400', async () => {
        const response = await makeRequest(
          components.localFetch,
          '/cast/presenters/invalid-address',
          { method: 'DELETE', metadata },
          owner
        )

        expect(response.status).toBe(400)
      })
    })
  })

  describe('when presenter operations target a world scene', () => {
    const worldMetadata = {
      sceneId: 'example.dcl.eth',
      realm: {
        serverName: 'example.dcl.eth',
        hostname: 'https://worlds-content-server.decentraland.org',
        protocol: 'https'
      },
      parcel: '3,4'
    }

    beforeEach(() => {
      spyComponents.worlds.resolveWorldSceneId.mockResolvedValue('trusted-world-scene')
      spyComponents.cast.getPresenters.mockResolvedValue({ presenters: [] })
    })

    it('should derive the room from the world and parcel resolver', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/cast/presenters',
        { method: 'GET', metadata: worldMetadata },
        owner
      )

      expect(response.status).toBe(200)
      expect(spyComponents.worlds.resolveWorldSceneId).toHaveBeenCalledWith('example.dcl.eth', 'example.dcl.eth', '3,4')
      expect(spyComponents.cast.getPresenters.mock.calls[0][0]).toContain('trusted-world-scene')
      expect(spyComponents.cast.getPresenters.mock.calls[0][0]).not.toContain('example.dcl.eth-example.dcl.eth')
    })
  })
})
