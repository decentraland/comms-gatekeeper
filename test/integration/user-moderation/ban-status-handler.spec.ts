import SQL from 'sql-template-strings'
import { test } from '../../components'

test('GET /users/:address/bans', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM user_warnings')
    await components.database.query('DELETE FROM user_bans')
    await components.database.query('DELETE FROM player_connection_info')
  })

  describe('when getting the ban status for a player', () => {
    let targetAddress: string

    beforeEach(() => {
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the player is banned', () => {
      beforeEach(async () => {
        await components.userModerationDb.createBan({
          bannedAddress: targetAddress,
          bannedBy: '0x0000000000000000000000000000000000000099',
          reason: 'Spamming'
        })
      })

      it('should respond with a 200 and isBanned true with ban details', async () => {
        const response = await components.localFetch.fetch(`/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(true)
        expect(body.data.ban).toBeDefined()
      })
    })

    describe('and the player is not banned', () => {
      it('should respond with a 200 and isBanned false', async () => {
        const response = await components.localFetch.fetch(`/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(false)
      })
    })

    describe('and two bans are created concurrently for the same address', () => {
      it('should persist exactly one active ban and reject the duplicate', async () => {
        const results = await Promise.allSettled([
          components.userModerationDb.createBan({
            bannedAddress: targetAddress,
            bannedBy: '0x0000000000000000000000000000000000000099',
            reason: 'First'
          }),
          components.userModerationDb.createBan({
            bannedAddress: targetAddress,
            bannedBy: '0x00000000000000000000000000000000000000aa',
            reason: 'Second'
          })
        ])

        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)

        const rows = await components.database.query(
          SQL`SELECT id FROM user_bans WHERE banned_address = ${targetAddress} AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now())`
        )
        expect(rows.rowCount).toBe(1)
      })
    })

    // Pins the intentional divergence: the gate rejects this player via the other wallet's device
    // snapshot, this endpoint reports address bans only. If it fails, the endpoint has become a
    // device-linkage oracle — see banStatusHandler.
    describe('and another player is banned from the device this player last connected from', () => {
      beforeEach(async () => {
        await components.playerConnectionDb.upsertPlayerConnection({
          address: targetAddress,
          ipAddress: '1.2.3.4',
          deviceId: 'shared-device'
        })
        await components.userModerationDb.createBan({
          bannedAddress: '0x0000000000000000000000000000000000000002',
          bannedBy: '0x0000000000000000000000000000000000000099',
          reason: 'Evasion',
          bannedDeviceId: 'shared-device'
        })
      })

      it('should respond with a 200 and isBanned false, reporting address bans only', async () => {
        const response = await components.localFetch.fetch(`/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(false)
      })

      it('should not disclose the other player ban record', async () => {
        const response = await components.localFetch.fetch(`/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        const body = await response.json()
        expect(body.data.ban).toBeUndefined()
      })

      it('should still reject the connection at the gate the token handlers use', async () => {
        const status = await components.userModeration.getActiveBanForConnection({
          address: targetAddress,
          deviceId: 'shared-device'
        })

        expect(status.isBanned).toBe(true)
      })
    })

    describe('and the player has an expired ban', () => {
      beforeEach(async () => {
        await components.userModerationDb.createBan({
          bannedAddress: targetAddress,
          bannedBy: '0x0000000000000000000000000000000000000099',
          reason: 'Expired ban',
          expiresAt: new Date(Date.now() - 1000)
        })
      })

      it('should respond with a 200 and isBanned false', async () => {
        const response = await components.localFetch.fetch(`/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(false)
      })
    })
  })
})
