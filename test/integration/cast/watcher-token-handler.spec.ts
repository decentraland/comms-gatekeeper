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

    // Mock cast component
    spyComponents.cast.validateWatcherToken.mockResolvedValue(mockCredentials)
  })

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

  it('should use provided identity when given', async () => {
    const customIdentity = 'custom-watcher-id'

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

  it('should reject requests without roomId', async () => {
    const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    expect(response.status).toBe(400)
  })

  it('should handle invalid request errors gracefully', async () => {
    spyComponents.cast.validateWatcherToken.mockRejectedValue(new InvalidRequestError('Internal error'))

    const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: validRoomId })
    })

    expect(response.status).toBe(400)
  })
})
