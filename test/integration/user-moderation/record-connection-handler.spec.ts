import { test } from '../../components'

test('POST /users/:address/connection-info', ({ components }) => {
  const validToken = 'aToken'
  const moderator = '0x0000000000000000000000000000000000000099'

  let address: string
  let otherAddress: string
  let deviceId: string
  let response: Response

  async function recordConnection(
    target: string,
    body: Record<string, unknown>,
    token: string = validToken
  ): Promise<Response> {
    return components.localFetch.fetch(`/users/${target}/connection-info`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }) as unknown as Promise<Response>
  }

  beforeEach(() => {
    address = '0x0000000000000000000000000000000000000001'
    otherAddress = '0x0000000000000000000000000000000000000002'
    deviceId = 'device-1'
  })

  afterEach(async () => {
    await components.database.query('DELETE FROM user_bans')
    await components.database.query('DELETE FROM player_connection_info')
  })

  describe('when the authorization token is invalid', () => {
    beforeEach(async () => {
      response = await recordConnection(address, { deviceId }, 'an-invalid-token')
    })

    it('should respond with a 401', () => {
      expect(response.status).toBe(401)
    })

    it('should not record anything', async () => {
      await expect(components.playerConnectionDb.getByAddress(address)).resolves.toBeNull()
    })
  })

  describe('when the authorization token is valid', () => {
    describe('and the body carries a device id and an IP', () => {
      beforeEach(async () => {
        response = await recordConnection(address, { deviceId, ipAddress: '203.0.113.10' })
      })

      it('should respond with a 204', () => {
        expect(response.status).toBe(204)
      })

      it('should store both values against the address', async () => {
        await expect(components.playerConnectionDb.getByAddress(address)).resolves.toMatchObject({
          address,
          deviceId,
          ipAddress: '203.0.113.10'
        })
      })
    })

    describe('and the address is sent in mixed case', () => {
      beforeEach(async () => {
        response = await recordConnection(address.toUpperCase().replace('0X', '0x'), { deviceId })
      })

      it('should store it lowercased so ban lookups can find it', async () => {
        await expect(components.playerConnectionDb.getByAddress(address)).resolves.toMatchObject({ deviceId })
      })
    })

    describe('and a later report omits the device id', () => {
      beforeEach(async () => {
        await recordConnection(address, { deviceId, ipAddress: '203.0.113.10' })
        response = await recordConnection(address, { ipAddress: '203.0.113.11' })
      })

      it('should keep the previously recorded device id', async () => {
        await expect(components.playerConnectionDb.getByAddress(address)).resolves.toMatchObject({ deviceId })
      })

      it('should update the IP', async () => {
        await expect(components.playerConnectionDb.getByAddress(address)).resolves.toMatchObject({
          ipAddress: '203.0.113.11'
        })
      })
    })

    describe('and the body carries an unknown property', () => {
      beforeEach(async () => {
        response = await recordConnection(address, { deviceId, somethingElse: 'x' })
      })

      it('should reject the request', () => {
        expect(response.status).toBe(400)
      })
    })

    describe('and the device id exceeds the accepted length', () => {
      beforeEach(async () => {
        response = await recordConnection(address, { deviceId: 'a'.repeat(129) })
      })

      it('should reject the request', () => {
        expect(response.status).toBe(400)
      })
    })

    describe('and a ban is issued after the connection was recorded', () => {
      let banStatus: Response

      beforeEach(async () => {
        await recordConnection(address, { deviceId })
        await components.userModeration.banPlayer(address, moderator, 'Evasion')

        banStatus = (await components.localFetch.fetch(`/users/${otherAddress}/ban-status`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${validToken}`,
            'X-Device-Id': deviceId
          }
        })) as unknown as Response
      })

      it('should snapshot the recorded device id onto the ban', async () => {
        const [ban] = await components.userModeration.getActiveBans()

        expect(ban).toMatchObject({ bannedDeviceId: deviceId })
      })

      it('should reject a different wallet reconnecting from that device', async () => {
        await expect(banStatus.json()).resolves.toEqual({ isBanned: true })
      })
    })
  })
})
