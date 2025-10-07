import { test } from '../../components'
import { makeRequest } from '../../utils'
import { InvalidRequestError } from '../../../src/types/errors'

test('Cast: Watcher Token Handler', function ({ components, spyComponents }) {
  let validRoomId: string
  let mockCredentials: any

  beforeEach(() => {
    validRoomId = 'place:test-123'

    mockCredentials = {
      url: 'wss://livekit.example.com',
      token: 'mock-watcher-jwt-token',
      roomId: validRoomId,
      identity: 'watcher:place:test-123:123456'
    }

    spyComponents.cast.validateWatcherToken.mockResolvedValue(mockCredentials)
  })

  describe('when requesting with valid room id', () => {
    it('should generate watcher token for valid room', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: validRoomId })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBeDefined()
      expect(body.token).toBeDefined()
      expect(body.roomId).toBeDefined()
      expect(body.identity).toBeDefined()
      expect(spyComponents.cast.validateWatcherToken).toHaveBeenCalledWith(validRoomId, '')
    })
  })

  describe('when providing custom identity', () => {
    let customIdentity: string

    beforeEach(() => {
      customIdentity = 'custom-watcher-id'
    })

    it('should use provided identity when given', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: validRoomId,
          identity: customIdentity
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(spyComponents.cast.validateWatcherToken).toHaveBeenCalledWith(validRoomId, customIdentity)
    })
  })

  describe('when roomId is missing', () => {
    it('should reject requests without roomId', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when validation fails with invalid request error', () => {
    beforeEach(() => {
      spyComponents.cast.validateWatcherToken.mockRejectedValue(new InvalidRequestError('Internal error'))
    })

    it('should handle invalid request errors gracefully', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: validRoomId })
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when sceneRoom credentials are available', () => {
    let mockCredentialsWithScene: any

    beforeEach(() => {
      mockCredentialsWithScene = {
        ...mockCredentials,
        roomName: 'test-place-name',
        sceneRoom: {
          url: 'wss://livekit.example.com',
          token: 'mock-scene-jwt-token',
          roomId: 'scene:fenrir:bafytest456'
        }
      }

      spyComponents.cast.validateWatcherToken.mockResolvedValue(mockCredentialsWithScene)
    })

    it('should return sceneRoom credentials when available for watchers', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: validRoomId })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBeDefined()
      expect(body.token).toBeDefined()
      expect(body.roomId).toBeDefined()
      expect(body.identity).toBeDefined()
      expect(body.roomName).toBe('test-place-name')
      expect(body.sceneRoom).toBeDefined()
      expect(body.sceneRoom.url).toBe('wss://livekit.example.com')
      expect(body.sceneRoom.token).toBe('mock-scene-jwt-token')
      expect(body.sceneRoom.roomId).toBe('scene:fenrir:bafytest456')
    })
  })

  describe('when sceneRoom credentials are not available', () => {
    let mockCredentialsWithoutScene: any

    beforeEach(() => {
      mockCredentialsWithoutScene = {
        ...mockCredentials,
        sceneRoom: undefined,
        roomName: undefined
      }

      spyComponents.cast.validateWatcherToken.mockResolvedValue(mockCredentialsWithoutScene)
    })

    it('should work without sceneRoom credentials when not available for watchers', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: validRoomId })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBeDefined()
      expect(body.token).toBeDefined()
      expect(body.sceneRoom).toBeUndefined()
      expect(body.roomName).toBeUndefined()
    })
  })
})
