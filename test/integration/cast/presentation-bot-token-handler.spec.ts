import { test } from '../../components'
import { makeRequest } from '../../utils'
import { InvalidStreamingKeyError, ExpiredStreamingKeyError } from '../../../src/logic/cast/errors'

test('Cast: Presentation Bot Token Handler', function ({ components, spyComponents }) {
  let validStreamingKey: string
  let mockResult: any

  beforeEach(() => {
    validStreamingKey = 'valid-stream-key-123'

    mockResult = {
      url: 'wss://livekit.example.com',
      token: 'mock-bot-jwt-token',
      roomId: 'scene:fenrir:bafytest123'
    }

    spyComponents.cast.generatePresentationBotToken.mockResolvedValue(mockResult)
  })

  describe('when the streaming key is valid', () => {
    it('should return bot token credentials', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamingKey: validStreamingKey })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBeDefined()
      expect(body.token).toBeDefined()
      expect(body.roomId).toBeDefined()
      expect(spyComponents.cast.generatePresentationBotToken).toHaveBeenCalledWith(validStreamingKey)
    })

  })

  describe('when the streaming key is invalid', () => {
    beforeEach(() => {
      spyComponents.cast.generatePresentationBotToken.mockRejectedValue(
        new InvalidStreamingKeyError()
      )
    })

    it('should return 401', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamingKey: 'invalid-key' })
      })

      expect(response.status).toBe(401)
    })
  })

  describe('when the streaming key has expired', () => {
    beforeEach(() => {
      spyComponents.cast.generatePresentationBotToken.mockRejectedValue(
        new ExpiredStreamingKeyError()
      )
    })

    it('should return 401', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamingKey: 'expired-key' })
      })

      expect(response.status).toBe(401)
    })
  })

  describe('when streamingKey is missing', () => {
    it('should return 400', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when streamingKey is empty', () => {
    it('should return 400 for empty string', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamingKey: '' })
      })

      expect(response.status).toBe(400)
    })

  })
})
