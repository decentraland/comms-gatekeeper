import { test } from '../../components'
import { makeRequest, owner } from '../../utils'
import { InvalidRequestError, UnauthorizedError } from '../../../src/types/errors'

test('Cast: Generate Stream Link Handler', function ({ components, spyComponents, stubComponents }) {
  let mockStreamLinkResult: any

  beforeEach(() => {
    mockStreamLinkResult = {
      streamLink: 'https://cast2.decentraland.org/s/cast2-link-abc123',
      streamingKey: 'cast2-link-abc123',
      placeId: 'test-place-id',
      placeName: 'Test Place',
      expiresAt: '2024-01-10T00:00:00.000Z',
      expiresInDays: 4
    }

    // Mock cast component
    spyComponents.cast.generateStreamLink.mockResolvedValue(mockStreamLinkResult)
  })

  it('should generate stream link with valid scene_id and realm_name', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parcel: '10,20'
        }),
        metadata: {
          sceneId: 'bafytest123',
          realm: {
            serverName: 'fenrir',
            hostname: 'https://peer.decentraland.zone',
            protocol: 'https'
          },
          parcel: '10,20'
        }
      },
      owner
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.streamLink).toBeDefined()
    expect(body.streamingKey).toBeDefined()
    expect(body.placeId).toBeDefined()
    expect(body.placeName).toBeDefined()
    expect(body.expiresAt).toBeDefined()
    expect(spyComponents.cast.generateStreamLink).toHaveBeenCalledWith({
      walletAddress: owner.authChain[0].payload,
      parcel: '10,20',
      worldName: undefined,
      sceneId: 'bafytest123',
      realmName: 'fenrir'
    })
  })

  it('should reject request without scene_id in authMetadata', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parcel: '10,20'
        }),
        metadata: {
          // Missing sceneId
          realm: {
            serverName: 'fenrir',
            hostname: 'https://peer.decentraland.zone',
            protocol: 'https'
          },
          parcel: '10,20'
        }
      },
      owner
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('sceneId and realmName are required')
  })

  it('should reject request without realm in authMetadata', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parcel: '10,20'
        }),
        metadata: {
          sceneId: 'bafytest123',
          parcel: '10,20'
          // Missing realm
        }
      },
      owner
    )

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toContain('no realm')
  })

  it('should generate stream link for world with scene_id and realm_name', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          worldName: 'myworld.dcl.eth'
        }),
        metadata: {
          sceneId: 'bafytest456',
          realm: {
            serverName: 'thor',
            hostname: 'https://worlds-content-server.decentraland.org',
            protocol: 'https'
          }
        }
      },
      owner
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.streamLink).toBeDefined()
    expect(spyComponents.cast.generateStreamLink).toHaveBeenCalledWith({
      walletAddress: owner.authChain[0].payload,
      worldName: 'myworld.dcl.eth',
      parcel: undefined,
      sceneId: 'bafytest456',
      realmName: 'thor'
    })
  })

  it('should reject request without sceneId and realmName when authentication is missing metadata', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parcel: '10,20'
        }),
        metadata: {
          parcel: '10,20'
        }
      },
      owner
    )

    expect(response.status).toBe(401)
  })

  describe('when parcel or worldName is missing', () => {
    beforeEach(() => {
      spyComponents.cast.generateStreamLink.mockRejectedValue(
        new InvalidRequestError('Either worldName or parcel must be provided')
      )
    })

    it('should reject request without parcel or worldName', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/cast/generate-stream-link',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({}),
          metadata: {
            sceneId: 'bafytest123',
            realm: {
              serverName: 'fenrir',
              hostname: 'https://peer.decentraland.zone',
              protocol: 'https'
            }
          }
        },
        owner
      )

      expect(response.status).toBe(400)
    })
  })

  describe('when user is not a scene admin', () => {
    beforeEach(() => {
      spyComponents.cast.generateStreamLink.mockRejectedValue(
        new UnauthorizedError('Only scene administrators can generate stream links')
      )
    })

    it('should reject unauthorized users who are not scene admins', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/cast/generate-stream-link',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            parcel: '10,20'
          }),
          metadata: {
            sceneId: 'bafytest123',
            realm: {
              serverName: 'fenrir',
              hostname: 'https://peer.decentraland.zone',
              protocol: 'https'
            },
            parcel: '10,20'
          }
        },
        owner
      )

      expect(response.status).toBe(401)
    })
  })
})
