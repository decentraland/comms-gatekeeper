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
    await components.database.query('DELETE FROM player_connection_info')
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

  describe('when the watcher is not banned but last connected from a device another wallet is banned on', () => {
    beforeEach(async () => {
      requestBody = { location: '20,-4', identity: 'clever-bear' }
      // The request itself carries no device identifier, so this is only caught via the device
      // recorded for the wallet on an earlier connection.
      await components.playerConnectionDb.upsertPlayerConnection({
        address: watcherAddress,
        ipAddress: '1.2.3.4',
        deviceId: 'banned-device'
      })
      await components.userModerationDb.createBan({
        bannedAddress: '0x0000000000000000000000000000000000000001',
        bannedBy,
        reason: 'Evasion',
        bannedDeviceId: 'banned-device'
      })
    })

    it('should respond with a 403 even though this wallet has no ban of its own', async () => {
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

    it('should still report the wallet as not banned on the public ban-status endpoint', async () => {
      const response = await makeRequest(components.localFetch, `/users/${watcherAddress}/bans`, { method: 'GET' })
      const body = await response.json()

      expect(body.data.isBanned).toBe(false)
    })
  })

  describe('when the watcher last connected from a device whose ban has been lifted', () => {
    beforeEach(async () => {
      requestBody = { location: '20,-4', identity: 'clever-bear' }
      await components.playerConnectionDb.upsertPlayerConnection({
        address: watcherAddress,
        ipAddress: '1.2.3.4',
        deviceId: 'banned-device'
      })
      await components.userModerationDb.createBan({
        bannedAddress: '0x0000000000000000000000000000000000000001',
        bannedBy,
        reason: 'Evasion',
        bannedDeviceId: 'banned-device'
      })
      await components.userModerationDb.liftBan('0x0000000000000000000000000000000000000001', bannedBy)
    })

    it('should not reject the watcher with a platform-ban error', async () => {
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
