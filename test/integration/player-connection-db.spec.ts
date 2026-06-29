import SQL from 'sql-template-strings'
import { test } from '../components'

test('player connection DB component', ({ components }) => {
  let address: string

  afterEach(async () => {
    await components.database.query('DELETE FROM player_connection_info')
  })

  describe('when upserting a player connection for the first time', () => {
    beforeEach(async () => {
      address = '0x0000000000000000000000000000000000000abc'
      await components.playerConnectionDb.upsertPlayerConnection({
        address,
        ipAddress: '1.2.3.4',
        deviceId: 'device-1'
      })
    })

    it('should store the ip address, device id and numeric timestamps', async () => {
      const info = await components.playerConnectionDb.getByAddress(address)

      expect(info).toEqual({
        address,
        ipAddress: '1.2.3.4',
        deviceId: 'device-1',
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number)
      })
    })
  })

  describe('when upserting a player connection that already exists', () => {
    beforeEach(async () => {
      address = '0x0000000000000000000000000000000000000abc'
      await components.playerConnectionDb.upsertPlayerConnection({
        address,
        ipAddress: '1.2.3.4',
        deviceId: 'device-1'
      })
      await components.playerConnectionDb.upsertPlayerConnection({
        address,
        ipAddress: '5.6.7.8',
        deviceId: 'device-2'
      })
    })

    it('should update the row with the latest ip address and device id', async () => {
      const info = await components.playerConnectionDb.getByAddress(address)

      expect(info).toMatchObject({ address, ipAddress: '5.6.7.8', deviceId: 'device-2' })
    })

    it('should keep exactly one row for the address', async () => {
      const result = await components.database.query(
        SQL`SELECT * FROM player_connection_info WHERE address = ${address}`
      )

      expect(result.rows).toHaveLength(1)
    })
  })

  describe('when upserting over an existing row without an ip address or device id', () => {
    beforeEach(async () => {
      address = '0x0000000000000000000000000000000000000abc'
      await components.playerConnectionDb.upsertPlayerConnection({
        address,
        ipAddress: '1.2.3.4',
        deviceId: 'device-1'
      })
      await components.playerConnectionDb.upsertPlayerConnection({ address })
    })

    it('should preserve the previously stored ip address and device id', async () => {
      const info = await components.playerConnectionDb.getByAddress(address)

      expect(info).toMatchObject({ address, ipAddress: '1.2.3.4', deviceId: 'device-1' })
    })
  })

  describe('when upserting over an existing row with empty ip address and device id', () => {
    beforeEach(async () => {
      address = '0x0000000000000000000000000000000000000abc'
      await components.playerConnectionDb.upsertPlayerConnection({
        address,
        ipAddress: '1.2.3.4',
        deviceId: 'device-1'
      })
      await components.playerConnectionDb.upsertPlayerConnection({ address, ipAddress: '', deviceId: '' })
    })

    it('should preserve the previously stored ip address and device id', async () => {
      const info = await components.playerConnectionDb.getByAddress(address)

      expect(info).toMatchObject({ address, ipAddress: '1.2.3.4', deviceId: 'device-1' })
    })
  })

  describe('when upserting over an existing row with a new ip address but no device id', () => {
    beforeEach(async () => {
      address = '0x0000000000000000000000000000000000000abc'
      await components.playerConnectionDb.upsertPlayerConnection({
        address,
        ipAddress: '1.2.3.4',
        deviceId: 'device-1'
      })
      await components.playerConnectionDb.upsertPlayerConnection({ address, ipAddress: '5.6.7.8' })
    })

    it('should update the ip address and preserve the existing device id', async () => {
      const info = await components.playerConnectionDb.getByAddress(address)

      expect(info).toMatchObject({ address, ipAddress: '5.6.7.8', deviceId: 'device-1' })
    })
  })

  describe('when upserting without an ip address or device id', () => {
    beforeEach(async () => {
      address = '0x0000000000000000000000000000000000000abc'
      await components.playerConnectionDb.upsertPlayerConnection({ address })
    })

    it('should store null for both the ip address and device id', async () => {
      const info = await components.playerConnectionDb.getByAddress(address)

      expect(info).toMatchObject({ address, ipAddress: null, deviceId: null })
    })
  })

  describe('when upserting with an empty ip address and device id', () => {
    beforeEach(async () => {
      address = '0x0000000000000000000000000000000000000abc'
      await components.playerConnectionDb.upsertPlayerConnection({ address, ipAddress: '', deviceId: '' })
    })

    it('should normalize the empty values to null', async () => {
      const info = await components.playerConnectionDb.getByAddress(address)

      expect(info).toMatchObject({ address, ipAddress: null, deviceId: null })
    })
  })

  describe('when getting a player that has no recorded connection info', () => {
    beforeEach(() => {
      address = '0x0000000000000000000000000000000000000fff'
    })

    it('should return null', async () => {
      const info = await components.playerConnectionDb.getByAddress(address)

      expect(info).toBeNull()
    })
  })
})
