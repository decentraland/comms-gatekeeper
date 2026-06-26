import { PrivateMessagesPrivacy } from '../../../src/types/social.type'
import { test } from '../../components'
import { makeRequest } from '../../utils'

test('GET /private-messages/token', ({ components, spyComponents }) => {
  // The handler records connection info and checks device/IP bans on every request, both
  // against the real database. Clean both tables between tests.
  afterEach(async () => {
    await components.database.query('DELETE FROM user_bans')
    await components.database.query('DELETE FROM player_connection_info')
  })

  describe('when the user is in the denyList', () => {
    beforeEach(() => {
      spyComponents.denyList.isDenylisted.mockResolvedValueOnce(true)
    })

    it('should respond with a 401', async () => {
      const response = await makeRequest(components.localFetch, '/private-messages/token', {
        metadata: { signer: 'dcl:explorer' }
      })

      expect(response.status).toBe(401)
      expect(response.json()).resolves.toEqual({ error: 'Access denied, deny-listed wallet' })
    })
  })

  describe('when the user is not in the denyList', () => {
    beforeEach(() => {
      spyComponents.denyList.isDenylisted.mockResolvedValueOnce(false)
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

  describe('when the request includes a device id and a Cloudflare IP header', () => {
    const identityAddress = '0x5babd1869989570988b79b5f5086e17a9e96a235'

    beforeEach(() => {
      spyComponents.denyList.isDenylisted.mockResolvedValueOnce(false)
      spyComponents.social.getUserPrivacySettings.mockResolvedValueOnce({
        private_messages_privacy: PrivateMessagesPrivacy.ALL
      })
      spyComponents.livekit.generateCredentials.mockResolvedValueOnce({
        token: 'valid-token',
        url: 'wss://dcl.livekit.cloud'
      })
    })

    it('should store the player IP address and device id', async () => {
      const response = await makeRequest(components.localFetch, '/private-messages/token', {
        metadata: { signer: 'dcl:explorer', deviceIdentifier: 'device-xyz' },
        headers: { 'cf-connecting-ip': '9.9.9.9' }
      })

      expect(response.status).toBe(200)
      const info = await components.playerConnectionDb.getByAddress(identityAddress)
      expect(info).toMatchObject({ ipAddress: '9.9.9.9', deviceId: 'device-xyz' })
    })
  })

  describe('when the request comes from a banned device under a different wallet', () => {
    beforeEach(async () => {
      spyComponents.denyList.isDenylisted.mockResolvedValueOnce(false)
      // A ban on a different wallet that captured this device id.
      await components.userModerationDb.createBan({
        bannedAddress: '0x0000000000000000000000000000000000000099',
        bannedBy: '0x0000000000000000000000000000000000000098',
        reason: 'Evasion',
        bannedDeviceId: 'banned-device'
      })
    })

    it('should respond with a 403 and the platform-banned error', async () => {
      const response = await makeRequest(components.localFetch, '/private-messages/token', {
        metadata: { signer: 'dcl:explorer', deviceIdentifier: 'banned-device' },
        headers: { 'cf-connecting-ip': '9.9.9.9' }
      })

      expect(response.status).toBe(403)
      expect(response.json()).resolves.toEqual({ error: 'Access denied, platform-banned user' })
    })
  })
})
