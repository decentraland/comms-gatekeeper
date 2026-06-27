import { test } from '../../components'

test('user moderation connection bans', ({ components }) => {
  const bannedBy = '0x0000000000000000000000000000000000000099'
  let bannedAddress: string
  let otherAddress: string

  afterEach(async () => {
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when an active ban recorded a device id', () => {
    beforeEach(async () => {
      bannedAddress = '0x0000000000000000000000000000000000000001'
      otherAddress = '0x0000000000000000000000000000000000000002'
      await components.userModerationDb.createBan({
        bannedAddress,
        bannedBy,
        reason: 'Evasion',
        bannedDeviceId: 'device-1'
      })
    })

    describe('and querying with a different address but the banned device id', () => {
      it('should report the connection as banned', async () => {
        const status = await components.userModerationDb.getActiveBanForConnection({
          address: otherAddress,
          deviceId: 'device-1'
        })

        expect(status.isBanned).toBe(true)
      })
    })

    describe('and querying with an unrelated address and device id', () => {
      it('should report the connection as not banned', async () => {
        const status = await components.userModerationDb.getActiveBanForConnection({
          address: otherAddress,
          deviceId: 'other-device'
        })

        expect(status.isBanned).toBe(false)
      })
    })

    describe('and querying with the banned address and no device id', () => {
      it('should report the connection as banned', async () => {
        const status = await components.userModerationDb.getActiveBanForConnection({ address: bannedAddress })

        expect(status.isBanned).toBe(true)
      })
    })

    describe('and listing active bans', () => {
      it('should include the banned device id on the record', async () => {
        const bans = await components.userModeration.getActiveBans()

        expect(bans).toHaveLength(1)
        expect(bans[0]).toMatchObject({ bannedDeviceId: 'device-1' })
      })
    })
  })

  describe('when a ban that recorded a device id has been lifted', () => {
    beforeEach(async () => {
      bannedAddress = '0x0000000000000000000000000000000000000001'
      otherAddress = '0x0000000000000000000000000000000000000002'
      await components.userModerationDb.createBan({
        bannedAddress,
        bannedBy,
        reason: 'Evasion',
        bannedDeviceId: 'device-1'
      })
      await components.userModerationDb.liftBan(bannedAddress, bannedBy)
    })

    it('should no longer report a connection from the banned device as banned', async () => {
      const status = await components.userModerationDb.getActiveBanForConnection({
        address: otherAddress,
        deviceId: 'device-1'
      })

      expect(status.isBanned).toBe(false)
    })
  })

  describe('when a ban that recorded a device id has expired', () => {
    beforeEach(async () => {
      bannedAddress = '0x0000000000000000000000000000000000000001'
      await components.userModerationDb.createBan({
        bannedAddress,
        bannedBy,
        reason: 'Evasion',
        bannedDeviceId: 'device-1',
        expiresAt: new Date(Date.now() - 1000)
      })
    })

    it('should not report the banned address as banned', async () => {
      const status = await components.userModerationDb.getActiveBanForConnection({ address: bannedAddress })

      expect(status.isBanned).toBe(false)
    })

    it('should not report a connection from the banned device as banned', async () => {
      const status = await components.userModerationDb.getActiveBanForConnection({
        address: '0x0000000000000000000000000000000000000002',
        deviceId: 'device-1'
      })

      expect(status.isBanned).toBe(false)
    })
  })
})
