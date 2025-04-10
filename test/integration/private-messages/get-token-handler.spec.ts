import { PrivateMessagesPrivacy } from '../../../src/types/social.type'
import { test } from '../../components'
import { makeRequest } from '../../utils'

test('GET /private-messages/token', ({ components, spyComponents }) => {
  describe('when the user is in the blocklist', () => {
    beforeEach(() => {
      spyComponents.blockList.isBlacklisted.mockResolvedValueOnce(true)
    })

    it('should respond with a 401', async () => {
      const response = await makeRequest(components.localFetch, '/private-messages/token', {
        metadata: { signer: 'dcl:explorer' }
      })

      expect(response.status).toBe(401)
      expect(response.json()).resolves.toEqual({ error: 'Access denied, deny-listed wallet' })
    })
  })

  describe('when the user is not in the blocklist', () => {
    beforeEach(() => {
      spyComponents.blockList.isBlacklisted.mockResolvedValueOnce(false)
    })

    describe('and requesting the user privacy settings fails but the retrieval of the token succeeds', () => {
      beforeEach(() => {
        spyComponents.social.getUserPrivacySettings.mockRejectedValueOnce(
          new Error('Failed to get user privacy settings')
        )
        spyComponents.livekit.generateCredentials.mockResolvedValueOnce({
          token: 'valid-token',
          url: 'wss://dcl.livekit.cloud'
        })
      })

      it('should respond with a 200, a valid LiveKit token and the user privacy settings as all', async () => {
        const response = await makeRequest(components.localFetch, '/private-messages/token', {
          metadata: { signer: 'dcl:explorer' }
        })

        expect(response.status).toBe(200)
        expect(response.json()).resolves.toEqual({
          adapter: 'livekit:wss://dcl.livekit.cloud?access_token=valid-token'
        })
        expect(spyComponents.livekit.generateCredentials).toHaveBeenCalledWith(
          '0x5babd1869989570988b79b5f5086e17a9e96a235',
          'private-messages',
          {
            cast: [],
            canPublish: false,
            canUpdateOwnMetadata: false
          },
          false,
          {
            private_messages_privacy: 'all'
          }
        )
      })
    })

    describe('and requesting the user privacy settings succeeds', () => {
      beforeEach(() => {
        spyComponents.social.getUserPrivacySettings.mockResolvedValueOnce({
          private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS
        })
      })

      describe('and retrieving a token for the private messages fails', () => {
        beforeEach(() => {
          spyComponents.livekit.generateCredentials.mockRejectedValueOnce(new Error('Failed to generate token'))
        })

        it('should respond with a 500', async () => {
          const response = await makeRequest(components.localFetch, '/private-messages/token', {
            metadata: { signer: 'dcl:explorer' }
          })

          expect(response.status).toBe(500)
          expect(response.json()).resolves.toEqual({ error: 'Internal Server Error' })
        })
      })

      describe('and retrieving a token for the private messages is successful', () => {
        beforeEach(() => {
          spyComponents.livekit.generateCredentials.mockResolvedValueOnce({
            token: 'valid-token',
            url: 'wss://dcl.livekit.cloud'
          })
        })

        it('should respond with a 200, a valid LiveKit token and the user privacy settings as the private messages privacy', async () => {
          const response = await makeRequest(components.localFetch, '/private-messages/token', {
            metadata: { signer: 'dcl:explorer' }
          })

          expect(response.status).toBe(200)
          expect(response.json()).resolves.toEqual({
            adapter: 'livekit:wss://dcl.livekit.cloud?access_token=valid-token'
          })
          expect(spyComponents.livekit.generateCredentials).toHaveBeenCalledWith(
            '0x5babd1869989570988b79b5f5086e17a9e96a235',
            'private-messages',
            {
              cast: [],
              canPublish: false,
              canUpdateOwnMetadata: false
            },
            false,
            {
              private_messages_privacy: PrivateMessagesPrivacy.ONLY_FRIENDS
            }
          )
        })
      })
    })
  })
})
