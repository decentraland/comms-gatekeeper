import { test } from '../../components'
import { makeRequest, owner } from '../../utils'
import { InvalidRequestError, UnauthorizedError } from '../../../src/types/errors'

test('Cast: Generate Stream Link Handler', function ({ components, spyComponents, stubComponents }) {
  let mockStreamLinkResult: any

  beforeEach(() => {
    mockStreamLinkResult = {
      streamLink: 'https://cast2.decentraland.org/s/cast2-link-abc123',
      watcherLink: 'https://cast2.decentraland.org/w/10,20',
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
        method: 'GET',
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
    expect(body.watcherLink).toBeDefined()
    expect(body.streamingKey).toBeDefined()
    expect(body.placeId).toBeDefined()
    expect(body.placeName).toBeDefined()
    expect(body.expiresAt).toBeDefined()
    expect(body.expiresInDays).toBe(4)
    expect(spyComponents.cast.generateStreamLink).toHaveBeenCalledWith({
      walletAddress: owner.authChain[0].payload,
      parcel: '10,20',
      worldName: undefined,
      sceneId: 'bafytest123',
      realmName: 'fenrir'
    })
  })

  describe('when calling generate-stream-link twice for same place', () => {
    beforeEach(() => {
      let callCount = 0
      spyComponents.cast.generateStreamLink.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return mockStreamLinkResult
        }
        // Second call should return same key (reused)
        return mockStreamLinkResult
      })
    })

    it('should reuse the same streaming key', async () => {
      const firstResponse = await makeRequest(
        components.localFetch,
        '/cast/generate-stream-link',
        {
          method: 'GET',
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

      const firstBody = await firstResponse.json()
      const firstKey = firstBody.streamingKey

      const secondResponse = await makeRequest(
        components.localFetch,
        '/cast/generate-stream-link',
        {
          method: 'GET',
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

      const secondBody = await secondResponse.json()

      expect(secondResponse.status).toBe(200)
      expect(secondBody.streamingKey).toBe(firstKey)
    })
  })

  describe('when existing key is expired', () => {
    let mockNewStreamLinkResult: any

    beforeEach(() => {
      mockNewStreamLinkResult = {
        streamLink: 'https://cast2.decentraland.org/s/new-ingress-stream-key-456',
        watcherLink: 'https://cast2.decentraland.org/w/10,20',
        streamingKey: 'new-ingress-stream-key-456',
        placeId: 'test-place-id',
        placeName: 'Test Place',
        expiresAt: '2024-01-15T00:00:00.000Z',
        expiresInDays: 4
      }

      // Mock implementation: generate new key instead of reusing expired one
      spyComponents.cast.generateStreamLink.mockResolvedValue(mockNewStreamLinkResult)
    })

    it('should generate a new streaming key', async () => {
      const response = await makeRequest(
        components.localFetch,
        '/cast/generate-stream-link',
        {
          method: 'GET',
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
      expect(body.streamingKey).toBe('new-ingress-stream-key-456')
      expect(body.expiresInDays).toBe(4)
    })
  })

  it('should reject request without scene_id in authMetadata', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'GET',
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
    expect(body.error).toContain('sceneId is required')
  })

  it('should reject request without realm in authMetadata', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'GET',
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
        method: 'GET',
        metadata: {
          sceneId: 'bafytest456',
          realm: {
            serverName: 'myworld.dcl.eth',
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
    expect(body.watcherLink).toBeDefined()
    expect(spyComponents.cast.generateStreamLink).toHaveBeenCalledWith({
      walletAddress: owner.authChain[0].payload,
      worldName: 'myworld.dcl.eth',
      parcel: undefined,
      sceneId: 'bafytest456',
      realmName: 'myworld.dcl.eth'
    })
  })

  it('should reject request without sceneId and realmName when authentication is missing metadata', async () => {
    const response = await makeRequest(
      components.localFetch,
      '/cast/generate-stream-link',
      {
        method: 'GET',
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
          method: 'GET',
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
          method: 'GET',
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
