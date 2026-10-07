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
    spyComponents.userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: false })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe.each([
    ['POST', '/scene-admin', 'admin'],
    ['DELETE', '/scene-admin', 'admin'],
    ['GET', '/scene-admin', undefined],
    ['POST', '/scene-bans', 'banned_address'],
    ['DELETE', '/scene-bans', 'banned_address'],
    ['GET', '/scene-bans', undefined],
    ['GET', '/scene-bans/addresses', undefined],
    ['POST', '/scene-stream-access', undefined],
    ['PUT', '/scene-stream-access', undefined],
    ['GET', '/scene-stream-access', undefined],
    ['DELETE', '/scene-stream-access', undefined],
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
})
