import { test, TEST_MODERATOR_ACCOUNT } from '../../components'
import { createTestIdentity, createTestIdentityFromAccount, Identity, makeAuthenticatedRequest } from './helpers'

test('GET /moderation/bans', ({ components }) => {
  const makeRequest = makeAuthenticatedRequest(components)

  afterEach(async () => {
    await components.database.query('DELETE FROM user_warnings')
    await components.database.query('DELETE FROM user_bans')
  })

  describe('when listing active bans', () => {
    describe('and the request is not signed', () => {
      it('should respond with a 400 status code', async () => {
        const response = await components.localFetch.fetch('/moderation/bans', {
          method: 'GET'
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
          const response = await makeRequest(nonModeratorIdentity, '/moderation/bans')
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

        describe('and there are no active bans', () => {
          it('should respond with a 200 and an empty array', async () => {
            const response = await makeRequest(moderatorIdentity, '/moderation/bans')
            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data).toEqual([])
          })
        })

        describe('and there are active bans', () => {
          beforeEach(async () => {
            await makeRequest(
              moderatorIdentity,
              '/moderation/users/0x0000000000000000000000000000000000000001/bans',
              'POST',
              { reason: 'Ban 1' }
            )
            await makeRequest(
              moderatorIdentity,
              '/moderation/users/0x0000000000000000000000000000000000000002/bans',
              'POST',
              { reason: 'Ban 2' }
            )
          })

          it('should respond with a 200 and all active bans', async () => {
            const response = await makeRequest(moderatorIdentity, '/moderation/bans')
            expect(response.status).toBe(200)
            const body = await response.json()
            expect(body.data).toHaveLength(2)
          })
        })
      })
    })
  })
})
