import { test } from '../../components'

test('GET /users/:address/ban-status', ({ components }) => {
  const bannedBy = '0x0000000000000000000000000000000000000099'
  const validToken = 'aToken'

  let bannedAddress: string
  let otherAddress: string
  let bannedDeviceId: string
  let response: Response
  let body: { isBanned: boolean }

  async function requestBanStatus(address: string, deviceId: string | undefined, token: string): Promise<Response> {
    return components.localFetch.fetch(`/users/${address}/ban-status`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(deviceId === undefined ? {} : { 'X-Device-Id': deviceId })
      }
    }) as unknown as Promise<Response>
  }

  beforeEach(() => {
    bannedAddress = '0x0000000000000000000000000000000000000001'
    otherAddress = '0x0000000000000000000000000000000000000002'
    bannedDeviceId = 'device-1'
  })

  afterEach(async () => {
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when the request has no authorization header', () => {
    beforeEach(async () => {
      response = (await components.localFetch.fetch(`/users/${bannedAddress}/ban-status`, {
        method: 'GET'
      })) as unknown as Response
    })

    it('should respond with a 401 and not disclose the ban status', async () => {
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.not.toHaveProperty('isBanned')
    })
  })

  describe('when the authorization token is invalid', () => {
    beforeEach(async () => {
      response = await requestBanStatus(bannedAddress, bannedDeviceId, 'an-invalid-token')
    })

    it('should respond with a 401 and not disclose the ban status', async () => {
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.not.toHaveProperty('isBanned')
    })
  })

  describe('when the authorization token is valid', () => {
    describe('and an active ban recorded a device id', () => {
      beforeEach(async () => {
        await components.userModerationDb.createBan({
          bannedAddress,
          bannedBy,
          reason: 'Evasion',
          bannedDeviceId
        })
      })

      describe('and the connection presents a different wallet on the banned device', () => {
        beforeEach(async () => {
          response = await requestBanStatus(otherAddress, bannedDeviceId, validToken)
          body = await response.json()
        })

        it('should respond with a 200', () => {
          expect(response.status).toBe(200)
        })

        it('should report the connection as banned', () => {
          expect(body.isBanned).toBe(true)
        })

        it('should not disclose the ban record nor the recorded device id', () => {
          expect(body).toEqual({ isBanned: true })
        })
      })

      describe('and the connection presents a different wallet on a different device', () => {
        beforeEach(async () => {
          response = await requestBanStatus(otherAddress, 'another-device', validToken)
          body = await response.json()
        })

        it('should report the connection as not banned', () => {
          expect(body.isBanned).toBe(false)
        })
      })

      describe('and the connection presents a different wallet with no device id', () => {
        beforeEach(async () => {
          response = await requestBanStatus(otherAddress, undefined, validToken)
          body = await response.json()
        })

        it('should report the connection as not banned', () => {
          expect(body.isBanned).toBe(false)
        })
      })

      describe('and the connection presents a different wallet with an empty device id', () => {
        beforeEach(async () => {
          response = await requestBanStatus(otherAddress, '', validToken)
          body = await response.json()
        })

        it('should report the connection as not banned', () => {
          expect(body.isBanned).toBe(false)
        })
      })

      describe('and the connection presents the banned wallet with no device id', () => {
        beforeEach(async () => {
          response = await requestBanStatus(bannedAddress, undefined, validToken)
          body = await response.json()
        })

        it('should report the connection as banned', () => {
          expect(body.isBanned).toBe(true)
        })
      })

      describe('and the device id header is sent in lowercase', () => {
        beforeEach(async () => {
          response = (await components.localFetch.fetch(`/users/${otherAddress}/ban-status`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${validToken}`,
              'x-device-id': bannedDeviceId
            }
          })) as unknown as Response
          body = await response.json()
        })

        it('should report the connection as banned', () => {
          expect(body.isBanned).toBe(true)
        })
      })

      describe('and the connection presents the banned wallet in a different letter case', () => {
        beforeEach(async () => {
          response = await requestBanStatus(bannedAddress.toUpperCase().replace('0X', '0x'), undefined, validToken)
          body = await response.json()
        })

        it('should report the connection as banned', () => {
          expect(body.isBanned).toBe(true)
        })
      })
    })

    describe('and the active ban recorded no device id', () => {
      beforeEach(async () => {
        await components.userModerationDb.createBan({
          bannedAddress,
          bannedBy,
          reason: 'Spamming'
        })
      })

      describe('and the connection presents the banned wallet with a device id', () => {
        beforeEach(async () => {
          response = await requestBanStatus(bannedAddress, bannedDeviceId, validToken)
          body = await response.json()
        })

        it('should report the connection as banned', () => {
          expect(body.isBanned).toBe(true)
        })
      })

      describe('and the connection presents a different wallet with a device id', () => {
        beforeEach(async () => {
          response = await requestBanStatus(otherAddress, bannedDeviceId, validToken)
          body = await response.json()
        })

        it('should report the connection as not banned', () => {
          expect(body.isBanned).toBe(false)
        })
      })
    })

    describe('and the ban on the device has expired', () => {
      beforeEach(async () => {
        await components.userModerationDb.createBan({
          bannedAddress,
          bannedBy,
          reason: 'Expired ban',
          bannedDeviceId,
          expiresAt: new Date(Date.now() - 1000)
        })

        response = await requestBanStatus(otherAddress, bannedDeviceId, validToken)
        body = await response.json()
      })

      it('should report the connection as not banned', () => {
        expect(body.isBanned).toBe(false)
      })
    })

    describe('and the ban on the device was lifted', () => {
      beforeEach(async () => {
        await components.userModerationDb.createBan({
          bannedAddress,
          bannedBy,
          reason: 'Lifted ban',
          bannedDeviceId
        })
        await components.userModerationDb.liftBan(bannedAddress, bannedBy)

        response = await requestBanStatus(otherAddress, bannedDeviceId, validToken)
        body = await response.json()
      })

      it('should report the connection as not banned', () => {
        expect(body.isBanned).toBe(false)
      })
    })

    describe('and no ban exists', () => {
      beforeEach(async () => {
        response = await requestBanStatus(bannedAddress, bannedDeviceId, validToken)
        body = await response.json()
      })

      it('should respond with a 200 and report the connection as not banned', () => {
        expect(response.status).toBe(200)
        expect(body.isBanned).toBe(false)
      })
    })
  })
})
