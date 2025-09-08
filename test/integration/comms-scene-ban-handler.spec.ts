import { test } from '../components'
import { makeRequest, owner, nonOwner } from '../utils'
import { TestCleanup } from '../db-cleanup'
import { PlaceAttributes } from '../../src/types/places.type'

test('POST /get-scene-adapter - should reject banned users', ({ components, stubComponents }) => {
  const placeId = `place-id-comms-scene-ban-test`

  beforeEach(async () => {
    const metadata = {
      identity: nonOwner.authChain[0].payload,
      realmName: 'test-realm',
      parcel: '10,20',
      sceneId: 'test-scene'
    }

    stubComponents.places.getPlaceByParcel.resolves({
      id: placeId,
      positions: ['10,20'],
      owner: owner.authChain[0].payload
    } as PlaceAttributes)

    stubComponents.blockList.isBlacklisted.resolves(false)
    stubComponents.livekit.getSceneRoomName.returns(`test-realm:test-scene`)
  })

  it('should reject access for banned user', async () => {
    stubComponents.sceneBans.isUserBanned.resolves(true)

    const response = await makeRequest(
      components.localFetch,
      '/get-scene-adapter',
      {
        method: 'POST',
        metadata: {
          identity: nonOwner.authChain[0].payload,
          realmName: 'test-realm',
          parcel: '10,20',
          sceneId: 'test-scene'
        }
      },
      nonOwner
    )

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body).toEqual({
      error: 'User is banned from this scene'
    })
  })

  it('should allow access for non-banned user', async () => {
    stubComponents.sceneBans.isUserBanned.resolves(false)
    stubComponents.livekit.generateCredentials.resolves({
      url: 'wss://test-livekit-url',
      token: 'test-token'
    })
    stubComponents.livekit.buildConnectionUrl.returns('wss://test-livekit-url?token=test-token')
    stubComponents.publisher.publishMessages.resolves({
      successfulMessageIds: ['test-message-id'],
      failedEvents: []
    })

    const response = await makeRequest(
      components.localFetch,
      '/get-scene-adapter',
      {
        method: 'POST',
        metadata: {
          identity: owner.authChain[0].payload,
          realmName: 'test-realm',
          parcel: '10,20',
          sceneId: 'test-scene'
        }
      },
      owner
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      adapter: 'wss://test-livekit-url?token=test-token'
    })
  })
})
