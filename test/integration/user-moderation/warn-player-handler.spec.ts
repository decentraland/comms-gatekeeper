import { test, TEST_MODERATOR_ACCOUNT } from '../../components'
import { createTestIdentity, createTestIdentityFromAccount, Identity, makeAuthenticatedRequest } from './helpers'

test('POST /moderation/users/:address/warnings', ({ components }) => {
  const makeRequest = makeAuthenticatedRequest(components)

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
        const response = await components.localFetch.fetch(`/moderation/users/${targetAddress}/warnings`, {
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
            `/moderation/users/${targetAddress}/warnings`,
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

        it('should respond with a 201 and the warning data', async () => {
          const response = await makeRequest(
            moderatorIdentity,
            `/moderation/users/${targetAddress}/warnings`,
            'POST',
            { reason: 'Bad behavior' }
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
              moderatorIdentity,
              `/moderation/users/${targetAddress}/warnings`,
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
