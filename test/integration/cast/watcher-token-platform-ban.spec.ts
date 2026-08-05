import { test } from '../../components'
import { makeRequest, admin } from '../../utils'

// Exercises the real cast component (unlike watcher-token-handler.spec.ts, which stubs it) so this
// covers the wiring of the platform-ban gate through components.ts.
test('POST /cast/watcher-token platform ban enforcement', ({ components, spyComponents }) => {
  const bannedBy = '0x0000000000000000000000000000000000000099'
  // The signer address makeRequest authenticates as by default.
  const watcherAddress = admin.authChain[0].payload.toLowerCase()
  let requestBody: Record<string, unknown>

  afterEach(async () => {
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when the watcher has an active platform ban', () => {
    beforeEach(async () => {
      requestBody = { location: '20,-4', identity: 'clever-bear' }
      await components.userModerationDb.createBan({
        bannedAddress: watcherAddress,
        bannedBy,
        reason: 'Harassment'
      })
    })

    it('should respond with a 403 and a message saying the user is platform-banned', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify(requestBody)
      })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body).toEqual({ error: 'Access denied, platform-banned user' })
    })

    it('should not issue any LiveKit credentials', async () => {
      await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify(requestBody)
      })

      expect(spyComponents.livekit.generateCredentials).not.toHaveBeenCalled()
    })

    it('should reject a world location the same way', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({ location: 'goerliplaza.dcl.eth', identity: 'clever-bear' })
      })

      expect(response.status).toBe(403)
    })
  })

  describe('when a different wallet has an active platform ban', () => {
    beforeEach(async () => {
      requestBody = { location: '20,-4', identity: 'clever-bear' }
      await components.userModerationDb.createBan({
        bannedAddress: '0x0000000000000000000000000000000000000001',
        bannedBy,
        reason: 'Harassment'
      })
    })

    it('should not reject this watcher with a platform-ban error', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify(requestBody)
      })
      const body = await response.json()

      expect(body).not.toEqual({ error: 'Access denied, platform-banned user' })
    })
  })
})
