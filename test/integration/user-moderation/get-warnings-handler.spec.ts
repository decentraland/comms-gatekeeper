import { test, TEST_MODERATOR_ACCOUNT } from '../../components'
import { makeRequest, getIdentity, getIdentityForAccount } from '../../utils'
import { AuthIdentity } from '@dcl/crypto'

test('GET /users/:address/warnings', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM user_warnings')
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when getting warnings for a player', () => {
    let targetAddress: string

    beforeEach(() => {
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localFetch.fetch(`/users/${targetAddress}/warnings`, {
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
            `/users/${targetAddress}/warnings`,
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

        describe('and the player has multiple warnings', () => {
          beforeEach(async () => {
            await makeRequest(
              components.localFetch,
              `/users/${targetAddress}/warnings`,
              {
                method: 'POST',
                body: JSON.stringify({ reason: 'Warning 1' })
              },
              moderatorIdentity
            )
            await makeRequest(
              components.localFetch,
              `/users/${targetAddress}/warnings`,
              {
                method: 'POST',
                body: JSON.stringify({ reason: 'Warning 2' })
              },
              moderatorIdentity
            )
          })

          it('should respond with a 200 and all warnings', async () => {
            const response = await makeRequest(
              components.localFetch,
              `/users/${targetAddress}/warnings`,
              { method: 'GET' },
              moderatorIdentity
            )
            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data).toHaveLength(2)
          })
        })

        describe('and the player has no warnings', () => {
          it('should respond with a 200 and an empty array', async () => {
            const response = await makeRequest(
              components.localFetch,
              `/users/0x0000000000000000000000000000000000000099/warnings`,
              { method: 'GET' },
              moderatorIdentity
            )
            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data).toEqual([])
          })
        })
      })
    })
  })
})
