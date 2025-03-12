import { test } from '../../components'
import { makeRequest } from '../../utils'

test('GET /private-messages/token', ({ components, stubComponents }) => {
  describe('when the user is in the blocklist', () => {
    beforeEach(() => {
      stubComponents.blockList.isBlacklisted.resolves(true)
    })

    it('should respond with a 401', async () => {
      const response = await makeRequest(components.localFetch, '/private-messages/token')

      expect(response.status).toBe(401)
      expect(response.json()).resolves.toEqual({ error: 'Access denied, deny-listed wallet' })
    })
  })

  describe('when the user is not in the blocklist', () => {
    beforeEach(() => {
      stubComponents.blockList.isBlacklisted.resolves(false)
    })

    describe('and retrieving a token for the private messages is successful', () => {
      beforeEach(() => {
        stubComponents.livekit.generateCredentials.resolves({
          token: 'valid-token',
          url: 'https://livekit.io'
        })
      })

      it('should respond with a 200 and a valid LiveKit token', async () => {
        const response = await makeRequest(components.localFetch, '/private-messages/token')

        expect(response.status).toBe(200)
        expect(response.json()).resolves.toEqual({ adapter: 'livekit:https://livekit.io?access_token=valid-token' })
      })
    })

    describe('and retrieving a token for the private messages fails', () => {
      beforeEach(() => {
        stubComponents.livekit.generateCredentials.rejects(new Error('Failed to generate token'))
      })

      it('should respond with a 500', async () => {
        const response = await makeRequest(components.localFetch, '/private-messages/token')

        expect(response.status).toBe(500)
        expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' })
      })
    })
  })
})
