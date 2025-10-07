import { test } from '../../components'
import { makeRequest } from '../../utils'
import { InvalidRequestError } from '../../../src/types/errors'

test('Cast: Watcher Token Handler', function ({ components, spyComponents }) {
  let validRoomId: string
  let mockCredentials: any

  beforeEach(() => {
    // Watchers now connect directly to the scene room
    validRoomId = 'scene:fenrir:bafytest123'

    mockCredentials = {
      url: 'wss://livekit.example.com',
      token: 'mock-watcher-jwt-token',
      roomId: validRoomId,
      identity: 'watcher:scene:fenrir:bafytest123:123456',
      roomName: 'Test Place Name'
    }

    spyComponents.cast.generateWatcherCredentials.mockResolvedValue(mockCredentials)
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
      expect(spyComponents.cast.generateWatcherCredentials).toHaveBeenCalledWith(validRoomId, '')
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
      expect(spyComponents.cast.generateWatcherCredentials).toHaveBeenCalledWith(validRoomId, customIdentity)
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
      spyComponents.cast.generateWatcherCredentials.mockRejectedValue(new InvalidRequestError('Internal error'))
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

  describe('when room name is available', () => {
    it('should include room name in response', async () => {
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
      expect(body.roomName).toBe('Test Place Name')
      // Verify the roomId is in scene format
      expect(body.roomId).toMatch(/^scene:/)
    })
  })
})
