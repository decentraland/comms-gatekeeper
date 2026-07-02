import { test } from '../../components'

test('GET /users/:address/bans', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM user_warnings')
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when getting the ban status for a player', () => {
    let targetAddress: string

    beforeEach(() => {
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the player is banned', () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

      beforeEach(async () => {
        await components.userModerationDb.createBan({
          bannedAddress: targetAddress,
          bannedBy: '0x0000000000000000000000000000000000000099',
          reason: 'Spamming',
          customMessage: 'You broke the rules',
          bannedDeviceId: 'device-abc',
          expiresAt
        })
      })

      it('should respond with a 200 and only the user-facing fields', async () => {
        const response = await components.localFetch.fetch(`/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(true)
        expect(body.data.customMessage).toBe('You broke the rules')
        expect(body.data.expiresAt).toBeDefined()
      })

      it('should not leak moderation internals (moderator identity, device id, reason)', async () => {
        const response = await components.localFetch.fetch(`/users/${targetAddress}/bans`, {
          method: 'GET'
        })
        const body = await response.json()
        // This route is unauthenticated; it must never expose the full ban record.
        expect(body.data.ban).toBeUndefined()
        expect(JSON.stringify(body)).not.toContain('0x0000000000000000000000000000000000000099')
        expect(JSON.stringify(body)).not.toContain('device-abc')
        expect(JSON.stringify(body)).not.toContain('Spamming')
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
          `SELECT id FROM user_bans WHERE banned_address = '${targetAddress}' AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now())`
        )
        expect(rows.rowCount).toBe(1)
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
