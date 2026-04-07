import { test } from '../../components'
import { makeRequest } from '../../utils'
import { InvalidStreamingKeyError, ExpiredStreamingKeyError } from '../../../src/logic/cast/errors'

test('Cast: Presentation Bot Token Handler', function ({ components, spyComponents }) {
  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when the streaming key is valid', () => {
    let mockResult: { url: string; token: string; roomId: string }

    beforeEach(() => {
      mockResult = {
        url: 'wss://livekit.example.com',
        token: 'mock-bot-jwt-token',
        roomId: 'scene:fenrir:bafytest123'
      }

      spyComponents.cast.generatePresentationBotToken.mockResolvedValueOnce(mockResult)
    })

    it('should respond with 200 and the bot token credentials', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamingKey: 'valid-stream-key-123' })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBe(mockResult.url)
      expect(body.token).toBe(mockResult.token)
      expect(body.roomId).toBe(mockResult.roomId)
    })

    it('should call generatePresentationBotToken with the streaming key', async () => {
      spyComponents.cast.generatePresentationBotToken.mockResolvedValueOnce(mockResult)

      await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamingKey: 'valid-stream-key-123' })
      })

      expect(spyComponents.cast.generatePresentationBotToken).toHaveBeenCalledWith('valid-stream-key-123')
    })
  })

  describe('when the streaming key is invalid', () => {
    beforeEach(() => {
      spyComponents.cast.generatePresentationBotToken.mockRejectedValueOnce(new InvalidStreamingKeyError())
    })

    it('should respond with 401', async () => {
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
      spyComponents.cast.generatePresentationBotToken.mockRejectedValueOnce(new ExpiredStreamingKeyError())
    })

    it('should respond with 401', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamingKey: 'expired-key' })
      })

      expect(response.status).toBe(401)
    })
  })

  describe('when the streamingKey is missing from the body', () => {
    it('should respond with 400', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when the streamingKey is an empty string', () => {
    it('should respond with 400', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamingKey: '' })
      })

      expect(response.status).toBe(400)
    })
  })
})
