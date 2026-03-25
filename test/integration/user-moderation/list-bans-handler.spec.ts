import { test, TEST_MODERATOR_ACCOUNT } from '../../components'
import { makeRequest, getIdentity, getIdentityForAccount } from '../../utils'
import { AuthIdentity } from '@dcl/crypto'

test('GET /bans', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM user_warnings')
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when listing active bans', () => {
    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localFetch.fetch('/bans', {
          method: 'GET'
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
            '/bans',
            { method: 'GET' },
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

        describe('and there are no active bans', () => {
          it('should respond with a 200 and an empty array', async () => {
            const response = await makeRequest(
              components.localFetch,
              '/bans',
              { method: 'GET' },
              moderatorIdentity
            )
            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data).toEqual([])
          })
        })

        describe('and there are active bans', () => {
          beforeEach(async () => {
            await makeRequest(
              components.localFetch,
              '/users/0x0000000000000000000000000000000000000001/bans',
              {
                method: 'POST',
                body: JSON.stringify({ reason: 'Ban 1' })
              },
              moderatorIdentity
            )
            await makeRequest(
              components.localFetch,
              '/users/0x0000000000000000000000000000000000000002/bans',
              {
                method: 'POST',
                body: JSON.stringify({ reason: 'Ban 2' })
              },
              moderatorIdentity
            )
          })

          it('should respond with a 200 and all active bans', async () => {
            const response = await makeRequest(
              components.localFetch,
              '/bans',
              { method: 'GET' },
              moderatorIdentity
            )
            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data).toHaveLength(2)
          })
        })
      })
    })
  })
})
