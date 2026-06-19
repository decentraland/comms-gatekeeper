import { test, TEST_MODERATOR_ACCOUNT } from '../../components'
import { makeRequest, getIdentity, getIdentityForAccount } from '../../utils'
import { AuthIdentity } from '@dcl/crypto'

test('POST /ips/:ip/bans', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM ip_bans')
    await components.database.query('DELETE FROM connection_logs')
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when banning an IP', () => {
    const targetIp = '1.2.3.4'

    describe('and the request is not signed', () => {
      it('should respond with a 401 status code', async () => {
        const response = await components.localFetch.fetch(`/ips/${targetIp}/bans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'test' })
        })
        expect(response.status).toBe(401)
      })
    })

    describe('and the caller is a moderator', () => {
      let moderatorIdentity: AuthIdentity

      beforeEach(async () => {
        moderatorIdentity = await getIdentityForAccount(TEST_MODERATOR_ACCOUNT)
      })

      describe('and a permanent ban is created', () => {
        it('should respond with a 201 and the ban data', async () => {
          const response = await makeRequest(
            components.localFetch,
            `/ips/${targetIp}/bans`,
            {
              method: 'POST',
              body: JSON.stringify({ reason: 'Suspicious activity' }),
              metadata: { signer: 'dcl:moderator' }
            },
            moderatorIdentity
          )
          expect(response.status).toBe(201)
          const body = await response.json()
          expect(body.data).toMatchObject({
            bannedIp: targetIp,
            reason: 'Suspicious activity',
            expiresAt: null,
            liftedAt: null
          })
          expect(body.data.id).toBeDefined()
        })
      })

      describe('and the IP is already banned', () => {
        beforeEach(async () => {
          await makeRequest(
            components.localFetch,
            `/ips/${targetIp}/bans`,
            {
              method: 'POST',
              body: JSON.stringify({ reason: 'First ban' }),
              metadata: { signer: 'dcl:moderator' }
            },
            moderatorIdentity
          )
        })

        it('should respond with a 409 conflict error', async () => {
          const response = await makeRequest(
            components.localFetch,
            `/ips/${targetIp}/bans`,
            {
              method: 'POST',
              body: JSON.stringify({ reason: 'Second ban' }),
              metadata: { signer: 'dcl:moderator' }
            },
            moderatorIdentity
          )
          expect(response.status).toBe(409)
          const body = await response.json()
          expect(body.error).toBe('Conflict')
        })
      })

      describe('and the reason is missing from the body', () => {
        it('should respond with a 400 status code', async () => {
          const response = await makeRequest(
            components.localFetch,
            `/ips/${targetIp}/bans`,
            {
              method: 'POST',
              body: JSON.stringify({}),
              metadata: { signer: 'dcl:moderator' }
            },
            moderatorIdentity
          )
          expect(response.status).toBe(400)
        })
      })

      describe('and banAllKnownAddresses is true with known addresses', () => {
        const knownAddress = '0x0000000000000000000000000000000000000001'

        beforeEach(async () => {
          await components.database.query(
            `INSERT INTO connection_logs (id, address, ip, connected_at) VALUES (gen_random_uuid(), '${knownAddress}', '${targetIp}', now())`
          )
        })

        it('should also ban the known addresses', async () => {
          const response = await makeRequest(
            components.localFetch,
            `/ips/${targetIp}/bans`,
            {
              method: 'POST',
              body: JSON.stringify({ reason: 'Abuse', banAllKnownAddresses: true }),
              metadata: { signer: 'dcl:moderator' }
            },
            moderatorIdentity
          )
          expect(response.status).toBe(201)

          const banStatusResponse = await components.localFetch.fetch(`/users/${knownAddress}/bans`)
          expect(banStatusResponse.status).toBe(200)
          const banStatusBody = await banStatusResponse.json()
          expect(banStatusBody.data.isBanned).toBe(true)
        })
      })
    })

    describe('and the caller is not a moderator', () => {
      let nonModeratorIdentity: AuthIdentity

      beforeEach(async () => {
        nonModeratorIdentity = await getIdentity()
      })

      it('should respond with a 401 error', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/ips/${targetIp}/bans`,
          {
            method: 'POST',
            body: JSON.stringify({ reason: 'test' }),
            metadata: { signer: 'dcl:moderator' }
          },
          nonModeratorIdentity
        )
        expect(response.status).toBe(401)
      })
    })
  })
})

test('GET /ips/:ip/bans', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM ip_bans')
  })

  describe('when getting the ban status of an IP', () => {
    const targetIp = '1.2.3.4'

    describe('and the IP is not banned', () => {
      it('should respond with 200 and isBanned false', async () => {
        const response = await components.localFetch.fetch(`/ips/${targetIp}/bans`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(false)
      })
    })

    describe('and the IP is banned', () => {
      let moderatorIdentity: AuthIdentity

      beforeEach(async () => {
        moderatorIdentity = await getIdentityForAccount(TEST_MODERATOR_ACCOUNT)
        await makeRequest(
          components.localFetch,
          `/ips/${targetIp}/bans`,
          {
            method: 'POST',
            body: JSON.stringify({ reason: 'Abuse' }),
            metadata: { signer: 'dcl:moderator' }
          },
          moderatorIdentity
        )
      })

      it('should respond with 200 and isBanned true', async () => {
        const response = await components.localFetch.fetch(`/ips/${targetIp}/bans`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.data.isBanned).toBe(true)
        expect(body.data.ban.bannedIp).toBe(targetIp)
      })
    })
  })
})

test('DELETE /ips/:ip/bans', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM ip_bans')
  })

  describe('when lifting an IP ban', () => {
    const targetIp = '1.2.3.4'
    let moderatorIdentity: AuthIdentity

    beforeEach(async () => {
      moderatorIdentity = await getIdentityForAccount(TEST_MODERATOR_ACCOUNT)
      await makeRequest(
        components.localFetch,
        `/ips/${targetIp}/bans`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Abuse' }),
          metadata: { signer: 'dcl:moderator' }
        },
        moderatorIdentity
      )
    })

    describe('and the IP has an active ban', () => {
      it('should respond with 204 and the ban should be lifted', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/ips/${targetIp}/bans`,
          { method: 'DELETE', metadata: { signer: 'dcl:moderator' } },
          moderatorIdentity
        )
        expect(response.status).toBe(204)

        const statusResponse = await components.localFetch.fetch(`/ips/${targetIp}/bans`)
        const statusBody = await statusResponse.json()
        expect(statusBody.data.isBanned).toBe(false)
      })
    })

    describe('and the IP has no active ban', () => {
      beforeEach(async () => {
        await makeRequest(
          components.localFetch,
          `/ips/${targetIp}/bans`,
          { method: 'DELETE', metadata: { signer: 'dcl:moderator' } },
          moderatorIdentity
        )
      })

      it('should respond with 404', async () => {
        const response = await makeRequest(
          components.localFetch,
          `/ips/${targetIp}/bans`,
          { method: 'DELETE', metadata: { signer: 'dcl:moderator' } },
          moderatorIdentity
        )
        expect(response.status).toBe(404)
      })
    })
  })
})

test('GET /users/:address/ips and GET /ips/:ip/users', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM connection_logs')
  })

  describe('when querying IPs for an address', () => {
    const address = '0x0000000000000000000000000000000000000001'
    const ip = '1.2.3.4'
    let moderatorIdentity: AuthIdentity

    beforeEach(async () => {
      moderatorIdentity = await getIdentityForAccount(TEST_MODERATOR_ACCOUNT)
      await components.database.query(
        `INSERT INTO connection_logs (id, address, ip, connected_at) VALUES (gen_random_uuid(), '${address}', '${ip}', now())`
      )
    })

    it('GET /users/:address/ips should return the known IPs', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/users/${address}/ips`,
        { metadata: { signer: 'dcl:moderator' } },
        moderatorIdentity
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.data).toContain(ip)
    })

    it('GET /ips/:ip/users should return the known addresses', async () => {
      const response = await makeRequest(
        components.localFetch,
        `/ips/${ip}/users`,
        { metadata: { signer: 'dcl:moderator' } },
        moderatorIdentity
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.data).toContain(address)
    })
  })
})
