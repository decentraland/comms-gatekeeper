import { test } from '../components'
import { makeRequest, owner, nonOwner } from '../utils'
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
    stubComponents.livekit.getSceneRoomName.returns(`test-realm:test-scene`)
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
})
