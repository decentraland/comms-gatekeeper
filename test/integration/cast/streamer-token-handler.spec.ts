import { test } from '../../components'
import { makeRequest } from '../../utils'
import { UnauthorizedError, InvalidRequestError } from '../../../src/types/errors'

test('Cast: Streamer Token Handler', function ({ components, spyComponents }) {
  let validToken: string
  let mockCredentials: any

  beforeEach(() => {
    validToken = 'valid-stream-token-123'

    // Streamers now connect directly to the scene room
    mockCredentials = {
      url: 'wss://livekit.example.com',
      token: 'mock-jwt-token',
      roomId: 'scene:fenrir:bafytest123', // Scene room format
      identity: 'stream:test-place-456:123456'
    }

    spyComponents.cast.validateStreamerToken.mockResolvedValue(mockCredentials)
  })

  describe('when the token is valid', () => {
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
  })

  describe('when the token is invalid', () => {
    beforeEach(() => {
      spyComponents.cast.validateStreamerToken.mockRejectedValue(
        new UnauthorizedError('Invalid or expired streaming token')
      )
    })

    it('should reject invalid streaming token', async () => {
      const response = await makeRequest(components.localFetch, '/cast/streamer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid-token' })
      })

      expect(response.status).toBe(401)
    })
  })

  describe('when the token is missing', () => {
    it('should reject requests without token', async () => {
      const response = await makeRequest(components.localFetch, '/cast/streamer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when validation fails with invalid request error', () => {
    beforeEach(() => {
      spyComponents.cast.validateStreamerToken.mockRejectedValue(new InvalidRequestError('Internal error'))
    })

    it('should handle invalid request errors gracefully', async () => {
      const response = await makeRequest(components.localFetch, '/cast/streamer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: validToken })
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when the token is expired', () => {
    let expiredToken: string

    beforeEach(() => {
      expiredToken = 'expired-token'
      spyComponents.cast.validateStreamerToken.mockRejectedValue(new UnauthorizedError('Streaming token has expired'))
    })

    it('should reject expired streaming token', async () => {
      const response = await makeRequest(components.localFetch, '/cast/streamer-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: expiredToken })
      })

      expect(response.status).toBe(401)
      expect(spyComponents.cast.validateStreamerToken).toHaveBeenCalledWith(expiredToken)
    })
  })

  describe('when token is valid with scene info', () => {
    it('should return credentials for the scene room', async () => {
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
      // Verify the roomId is in scene format
      expect(body.roomId).toMatch(/^scene:/)
    })
  })
})
