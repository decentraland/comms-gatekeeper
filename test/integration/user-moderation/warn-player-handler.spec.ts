import { test, TEST_MODERATOR_ACCOUNT } from '../../components'
import { makeRequest, getIdentity, getIdentityForAccount } from '../../utils'
import { AuthIdentity } from '@dcl/crypto'

test('POST /users/:address/warnings', ({ components }) => {
  afterEach(async () => {
    await components.database.query('DELETE FROM user_warnings')
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when warning a player', () => {
    let targetAddress: string

    beforeEach(() => {
      targetAddress = '0x0000000000000000000000000000000000000001'
    })

    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localFetch.fetch(`/users/${targetAddress}/warnings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'test' })
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
            {
              method: 'POST',
              body: JSON.stringify({ reason: 'test' })
            },
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

        it('should respond with a 201 and the warning data', async () => {
          const response = await makeRequest(
            components.localFetch,
            `/users/${targetAddress}/warnings`,
            {
              method: 'POST',
              body: JSON.stringify({ reason: 'Bad behavior' })
            },
            moderatorIdentity
          )
          expect(response.status).toBe(201)
          const body = await response.json()
          expect(body.data).toMatchObject({
            warnedAddress: targetAddress,
            reason: 'Bad behavior'
          })
          expect(body.data.id).toBeDefined()
        })

        describe('and the reason is missing from the body', () => {
          it('should respond with a 400 status code', async () => {
            const response = await makeRequest(
              components.localFetch,
              `/users/${targetAddress}/warnings`,
              {
                method: 'POST',
                body: JSON.stringify({})
              },
              moderatorIdentity
            )
            expect(response.status).toBe(400)
          })
        })
      })
    })
  })
})
