import { test, TEST_MODERATOR_ACCOUNT } from '../../components'
import { createTestIdentity, createTestIdentityFromAccount, Identity, makeAuthenticatedRequest } from './helpers'

test('POST /moderation/users/:address/bans', ({ components }) => {
  const makeRequest = makeAuthenticatedRequest(components)

  afterEach(async () => {
    await components.database.query('DELETE FROM user_warnings')
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when banning a player', () => {
    let targetAddress: string

    beforeEach(() => {
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localFetch.fetch(`/moderation/users/${targetAddress}/bans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'test' })
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the caller is not a moderator', () => {
        let nonModeratorIdentity: Identity

        beforeEach(async () => {
          nonModeratorIdentity = await createTestIdentity()
        })

        it('should respond with a 401 and the unauthorized error', async () => {
          const response = await makeRequest(
            nonModeratorIdentity,
            `/moderation/users/${targetAddress}/bans`,
            'POST',
            { reason: 'test' }
          )
          expect(response.status).toBe(401)
          const body = await response.json()
          expect(body.error).toBe('You are not authorized to access this resource')
        })
      })

      describe('and the caller is a moderator', () => {
        let moderatorIdentity: Identity

        beforeEach(async () => {
          moderatorIdentity = await createTestIdentityFromAccount(TEST_MODERATOR_ACCOUNT)
        })

        describe('and a permanent ban is created with a valid reason', () => {
          it('should respond with a 201 and the ban data and the player should be reported as banned', async () => {
            const response = await makeRequest(
              moderatorIdentity,
              `/moderation/users/${targetAddress}/bans`,
              'POST',
              { reason: 'Spamming' }
            )
            expect(response.status).toBe(201)
            const body = await response.json()
            expect(body.data).toMatchObject({
              bannedAddress: targetAddress,
              reason: 'Spamming',
              expiresAt: null,
              liftedAt: null
            })
            expect(body.data.id).toBeDefined()

            const statusResponse = await components.localFetch.fetch(
              `/moderation/users/${targetAddress}/bans`,
              { method: 'GET' }
            )
            expect(statusResponse.status).toBe(200)
            const statusBody = await statusResponse.json()
            expect(statusBody.data.isBanned).toBe(true)
            expect(statusBody.data.ban.id).toBe(body.data.id)
          })
        })

        describe('and a timed ban is created with duration and custom message', () => {
          it('should respond with a 201 and include expiresAt and customMessage', async () => {
            const response = await makeRequest(
              moderatorIdentity,
              `/moderation/users/${targetAddress}/bans`,
              'POST',
              { reason: 'Temporary ban', duration: 3600000, customMessage: 'You have been temporarily banned' }
            )
            expect(response.status).toBe(201)
            const body = await response.json()
            expect(body.data).toMatchObject({
              bannedAddress: targetAddress,
              reason: 'Temporary ban',
              customMessage: 'You have been temporarily banned'
            })
            expect(body.data.expiresAt).toBeDefined()
          })
        })

        describe('and the player is already banned', () => {
          beforeEach(async () => {
            await makeRequest(moderatorIdentity, `/moderation/users/${targetAddress}/bans`, 'POST', {
              reason: 'First ban'
            })
          })

          it('should respond with a 409 and a conflict error', async () => {
            const response = await makeRequest(
              moderatorIdentity,
              `/moderation/users/${targetAddress}/bans`,
              'POST',
              { reason: 'Second ban' }
            )
            expect(response.status).toBe(409)
            const body = await response.json()
            expect(body.error).toBe('Conflict')
          })
        })

        describe('and the reason is missing from the body', () => {
          it('should respond with a 400 status code', async () => {
            const response = await makeRequest(
              moderatorIdentity,
              `/moderation/users/${targetAddress}/bans`,
              'POST',
              {}
            )
            expect(response.status).toBe(400)
          })
        })
      })
    })
  })
})
