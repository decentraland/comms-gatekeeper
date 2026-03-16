import { test, TEST_MODERATOR_ACCOUNT } from '../../components'
import { makeRequest, getIdentity, getIdentityForAccount } from '../../utils'
import { AuthIdentity } from '@dcl/crypto'

test('DELETE /moderation/users/:address/bans', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM user_warnings')
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when lifting a ban', () => {
    let targetAddress: string

    beforeEach(() => {
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localFetch.fetch(`/moderation/users/${targetAddress}/bans`, {
          method: 'DELETE'
        })
        expect(response.status).toBe(400)
      })
    })

    describe('and the request is signed', () => {
      describe('and the caller is not a moderator', () => {
        let nonModeratorIdentity: AuthIdentity

        beforeEach(async () => {
          nonModeratorIdentity = await getIdentity()
        })

        it('should respond with a 401 and the unauthorized error', async () => {
          const response = await makeRequest(
            components.localFetch,
            `/moderation/users/${targetAddress}/bans`,
            { method: 'DELETE' },
            nonModeratorIdentity
          )
          expect(response.status).toBe(401)
          const body = await response.json()
          expect(body.error).toBe('You are not authorized to access this resource')
        })
      })

      describe('and the caller is a moderator', () => {
        let moderatorIdentity: AuthIdentity

        beforeEach(async () => {
          moderatorIdentity = await getIdentityForAccount(TEST_MODERATOR_ACCOUNT)
        })

        describe('and the player has an active ban', () => {
          beforeEach(async () => {
            await makeRequest(
              components.localFetch,
              `/moderation/users/${targetAddress}/bans`,
              {
                method: 'POST',
                body: JSON.stringify({ reason: 'Spamming' })
              },
              moderatorIdentity
            )
          })

          it('should respond with a 204 status code and the ban should no longer be active', async () => {
            const response = await makeRequest(
              components.localFetch,
              `/moderation/users/${targetAddress}/bans`,
              { method: 'DELETE' },
              moderatorIdentity
            )
            expect(response.status).toBe(204)

            const statusResponse = await components.localFetch.fetch(
              `/moderation/users/${targetAddress}/bans`,
              { method: 'GET' }
            )
            expect(statusResponse.status).toBe(200)
            const statusBody = await statusResponse.json()
            expect(statusBody.data.isBanned).toBe(false)
          })
        })

        describe('and no active ban exists for the player', () => {
          it('should respond with a 404 and a not found error', async () => {
            const response = await makeRequest(
              components.localFetch,
              `/moderation/users/${targetAddress}/bans`,
              { method: 'DELETE' },
              moderatorIdentity
            )
            expect(response.status).toBe(404)
            const body = await response.json()
            expect(body.error).toBe('Not Found')
          })
        })
      })
    })
  })
})
