import { test } from '../../components'
import { makeRequest } from '../../utils'
import SQL from 'sql-template-strings'

test('Cast: Presentation Bot Token Handler', function ({ components, spyComponents }) {
  beforeEach(async () => {
    await components.database.query(SQL`DELETE FROM scene_stream_access WHERE place_id LIKE 'test-bot-%'`)
  })

  afterEach(async () => {
    await components.database.query(SQL`DELETE FROM scene_stream_access WHERE place_id LIKE 'test-bot-%'`)
    jest.resetAllMocks()
  })

  describe('when the streaming key exists in the database', () => {
    describe('and is not expired', () => {
      let streamingKey: string

      beforeEach(async () => {
        streamingKey = 'valid-bot-key'
        const now = Date.now()
        const futureTime = now + 4 * 24 * 60 * 60 * 1000

        await components.database.query(
          SQL`INSERT INTO scene_stream_access
            (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time, room_id)
            VALUES
            (gen_random_uuid(), 'test-bot-valid', ${streamingKey}, 'rtmp://test-url', 'ingress-bot', ${now}, true, false, ${futureTime}, 'scene:fenrir:bafytest123')`
        )

        spyComponents.livekit.generateCredentials.mockResolvedValueOnce({
          url: 'wss://livekit.example.com',
          token: 'mock-bot-jwt-token'
        })
      })

      it('should respond with 200 and the bot token credentials', async () => {
        const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
          method: 'POST',
          body: JSON.stringify({ streamingKey })
        })

        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.url).toBe('wss://livekit.example.com')
        expect(body.token).toBe('mock-bot-jwt-token')
        expect(body.roomId).toBe('scene:fenrir:bafytest123')
      })
    })

    describe('and is expired', () => {
      let streamingKey: string

      beforeEach(async () => {
        streamingKey = 'expired-bot-key'
        const now = Date.now()
        const pastTime = now - 1000

        await components.database.query(
          SQL`INSERT INTO scene_stream_access
            (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time, room_id)
            VALUES
            (gen_random_uuid(), 'test-bot-expired', ${streamingKey}, 'rtmp://test-url', 'ingress-bot-exp', ${now}, true, false, ${pastTime}, 'scene:fenrir:bafytest123')`
        )
      })

      it('should respond with 401', async () => {
        const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
          method: 'POST',
          body: JSON.stringify({ streamingKey })
        })

        expect(response.status).toBe(401)
      })
    })
  })

  describe('when the streaming key does not exist in the database', () => {
    it('should respond with 401', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        body: JSON.stringify({ streamingKey: 'nonexistent-key' })
      })

      expect(response.status).toBe(401)
    })
  })

  describe('when the streamingKey is missing from the body', () => {
    it('should respond with 400', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        body: JSON.stringify({})
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when the streamingKey is an empty string', () => {
    it('should respond with 400', async () => {
      const response = await makeRequest(components.localFetch, '/cast/presentation-bot-token', {
        method: 'POST',
        body: JSON.stringify({ streamingKey: '' })
      })

      expect(response.status).toBe(400)
    })
  })
})
