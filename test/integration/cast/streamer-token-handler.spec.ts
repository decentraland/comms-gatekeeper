import { test } from '../../components'
import { makeRequest } from '../../utils'
import { UnauthorizedError, InvalidRequestError } from '../../../src/types/errors'

test('Cast: Streamer Token Handler', function ({ components, spyComponents }) {
  let validToken: string
  let mockCredentials: any

  beforeEach(() => {
    validToken = 'valid-stream-token-123'

    mockCredentials = {
      url: 'wss://livekit.example.com',
      token: 'mock-jwt-token',
      roomId: 'place:test-place-456',
      identity: 'stream:test-place-456:123456'
    }

    // Mock cast component
    spyComponents.cast.validateStreamerToken.mockResolvedValue(mockCredentials)
  })

  it('should generate streamer token with valid streaming key', async () => {
    const response = await makeRequest(components.localFetch, '/cast/streamer-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: validToken })
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.url).toBeDefined()
    expect(body.token).toBeDefined()
    expect(body.roomId).toBeDefined()
    expect(body.identity).toBeDefined()
    expect(spyComponents.cast.validateStreamerToken).toHaveBeenCalledWith(validToken)
  })

  it('should reject invalid streaming token', async () => {
    spyComponents.cast.validateStreamerToken.mockRejectedValue(
      new UnauthorizedError('Invalid or expired streaming token')
    )

    const response = await makeRequest(components.localFetch, '/cast/streamer-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token' })
    })

    expect(response.status).toBe(401)
  })

  it('should reject requests without token', async () => {
    const response = await makeRequest(components.localFetch, '/cast/streamer-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    expect(response.status).toBe(400)
  })

  it('should handle invalid request errors gracefully', async () => {
    spyComponents.cast.validateStreamerToken.mockRejectedValue(new InvalidRequestError('Internal error'))

    const response = await makeRequest(components.localFetch, '/cast/streamer-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: validToken })
    })

    expect(response.status).toBe(400)
  })

  it('should reject expired streaming token', async () => {
    spyComponents.cast.validateStreamerToken.mockRejectedValue(new UnauthorizedError('Streaming token has expired'))

    const response = await makeRequest(components.localFetch, '/cast/streamer-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'expired-token' })
    })

    expect(response.status).toBe(401)
    expect(spyComponents.cast.validateStreamerToken).toHaveBeenCalledWith('expired-token')
  })
})
