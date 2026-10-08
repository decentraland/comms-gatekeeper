import { createMockedPlace, createMockedWorldPlace } from '../mocks/places-mock'
import { ServiceUnavailableError } from '../../src/types/errors'
import { EntityType } from '@dcl/schemas'
import { createPlacesComponent } from '../../src/adapters/places'
import { test } from '../components'
import { makeRequest, owner, nonOwner } from '../utils'

test('Scene deployment authorization', ({ components, spyComponents }) => {
  let metadata: { sceneId: string; parcel: string; realm: { serverName: string; hostname: string } }
  let body: string | undefined

  beforeEach(async () => {
    metadata = {
      sceneId: 'requested-deployment',
      parcel: '1,2',
      realm: { serverName: 'test-realm', hostname: 'https://peer.decentraland.org' }
    }
    spyComponents.contentClient.fetchEntityById.mockResolvedValue({
      id: 'requested-deployment',
      type: EntityType.SCENE,
      version: 'v3',
      timestamp: 1,
      content: [],
      pointers: ['3,4'],
      metadata: { scene: { base: '3,4', parcels: ['3,4'] } }
    })
    // Exercise the real adapter validation through every HTTP authorization path.
    const places = await createPlacesComponent(components)
    spyComponents.places.getPlaceBySceneId.mockImplementation(places.getPlaceBySceneId)
    spyComponents.places.resolveScenePlace.mockImplementation(places.resolveScenePlace)
    spyComponents.userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: false })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe.each([
    ['POST', '/scene-admin', 'admin'],
    ['DELETE', '/scene-admin', 'admin'],
    ['POST', '/scene-bans', 'banned_address'],
    ['DELETE', '/scene-bans', 'banned_address'],
    ['POST', '/scene-stream-access', undefined],
    ['PUT', '/scene-stream-access', undefined],
    ['GET', '/cast/generate-stream-link', undefined]
  ])('when %s %s supplies a parcel outside the deployment', (method, path, addressField) => {
    beforeEach(() => {
      body = addressField ? JSON.stringify({ [addressField]: nonOwner.authChain[0].payload }) : undefined
    })

    it('should reject the mismatch before checking ownership or mutating a room', async () => {
      const response = await makeRequest(
        components.localFetch,
        path,
        { method, metadata, body, headers: { 'Content-Type': 'application/json' } },
        owner
      )
      expect(response.status).toBe(404)
      expect(spyComponents.sceneManager.isSceneOwnerOrAdmin).not.toHaveBeenCalled()
      expect(spyComponents.livekit.createIngress).not.toHaveBeenCalled()
      expect(spyComponents.livekit.removeIngress).not.toHaveBeenCalled()
      expect(spyComponents.livekit.removeParticipant).not.toHaveBeenCalled()
    })
  })
  describe.each([
    ['GET', '/scene-admin', 200],
    ['GET', '/scene-bans', 200],
    ['GET', '/scene-bans/addresses', 200],
    ['GET', '/scene-stream-access', 200],
    ['DELETE', '/scene-stream-access', 204]
  ])('when %s %s operates on a place after redeployment', (method, path, expectedStatus) => {
    beforeEach(() => {
      metadata.sceneId = undefined
      spyComponents.worlds.resolveWorldSceneId.mockRejectedValue(new ServiceUnavailableError('Worlds unavailable'))
      spyComponents.contentClient.fetchEntityById.mockRejectedValue(new ServiceUnavailableError('Catalyst unavailable'))
      spyComponents.places.getPlaceBySceneId.mockRejectedValue(new ServiceUnavailableError('Deployment unavailable'))
      spyComponents.places.getPlaceByParcel.mockResolvedValue(
        createMockedPlace({ id: 'selected-place', positions: ['1,2'] })
      )
      spyComponents.places.getWorldScenePlace.mockResolvedValue(
        createMockedWorldPlace({ id: 'selected-place', positions: ['1,2'] })
      )
      spyComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
      spyComponents.sceneAdmins.getAdminsAndExtraAddresses.mockResolvedValue({
        admins: new Set(),
        addresses: new Set(),
        extraAddresses: new Set()
      })
      spyComponents.lands.getLeaseHoldersForParcels.mockResolvedValue([])
      spyComponents.names.getNamesFromAddresses.mockResolvedValue({})
      spyComponents.sceneBanManager.listBannedAddresses.mockResolvedValue([])
      spyComponents.sceneBanManager.countBannedAddresses.mockResolvedValue(0)
      spyComponents.sceneStreamAccessManager.getAccess.mockResolvedValue({
        id: 'stored-access',
        active: true,
        streaming: false,
        streaming_start_time: null,
        place_id: 'selected-place',
        room_id: 'stored-room',
        ingress_id: 'stored-ingress',
        streaming_key: 'stored-key',
        streaming_url: 'rtmp://test',
        created_at: String(Date.now()),
        expiration_time: String(Date.now() + 60000)
      })
      spyComponents.sceneStreamAccessManager.removeAccess.mockResolvedValue(undefined)
      spyComponents.livekit.removeIngress.mockResolvedValue(undefined)
      spyComponents.notifications.sendNotificationType.mockResolvedValue(undefined)
    })

    describe.each([false, true])('and world is %s', (isWorld) => {
      beforeEach(() => {
        if (isWorld) metadata.realm = { serverName: 'selected.eth', hostname: 'https://worlds-content-server.org' }
      })

      it('should operate on the selected place without resolving the old deployment', async () => {
        const response = await makeRequest(components.localFetch, path, { method, metadata }, owner)
        expect(response.status).toBe(expectedStatus)
        expect(spyComponents.places.getPlaceBySceneId).not.toHaveBeenCalled()
        expect(spyComponents.worlds.resolveWorldSceneId).not.toHaveBeenCalled()
        if (path === '/scene-stream-access') {
          expect(spyComponents.sceneStreamAccessManager.getAccess).toHaveBeenCalledWith('selected-place')
          if (method === 'DELETE') expect(spyComponents.livekit.removeIngress).toHaveBeenCalledWith('stored-ingress')
        }
      })

      if (path !== '/scene-admin') {
        describe('and the caller has no permission over the selected place', () => {
          beforeEach(() => {
            spyComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)
          })

          it('should reject access without returning a key or revoking an ingress', async () => {
            const response = await makeRequest(components.localFetch, path, { method, metadata }, owner)
            expect(response.status).toBe(401)
            expect(spyComponents.sceneStreamAccessManager.getAccess).not.toHaveBeenCalled()
            expect(spyComponents.livekit.removeIngress).not.toHaveBeenCalled()
          })
        })
      }
    })
  })
  describe.each([
    ['GET', '/scene-admin'],
    ['GET', '/scene-bans'],
    ['GET', '/scene-bans/addresses'],
    ['GET', '/scene-stream-access'],
    ['DELETE', '/scene-stream-access']
  ])('when %s %s omits the parcel', (method, path) => {
    beforeEach(() => {
      metadata.parcel = undefined
    })
    it('should reject before resolving a place', async () => {
      const response = await makeRequest(components.localFetch, path, { method, metadata }, owner)
      expect(response.status).toBe(400)
      expect(spyComponents.places.getPlaceByParcel).not.toHaveBeenCalled()
      expect(spyComponents.places.getWorldScenePlace).not.toHaveBeenCalled()
    })
  })
})
