import { test } from '../../components'
import { makeRequest } from '../../utils'
import { CommunityRole } from '../../../src/types/social.type'
import { CommunityVoiceChatAction } from '../../../src/types/community-voice'

// Exercises the real voice component (unlike community-voice-chat-handler.spec.ts, which stubs
// it) so this covers the wiring of the platform-ban gate through components.ts, not just the
// component in isolation.
test('POST /community-voice-chat platform ban enforcement', ({ components, spyComponents }) => {
  const communityId = 'test-community'
  const bannedBy = '0x0000000000000000000000000000000000000099'
  const token = 'aToken'
  let userAddress: string
  let requestBody: Record<string, unknown>

  afterEach(async () => {
    await components.database.query('DELETE FROM user_bans')
    await components.database.query('DELETE FROM player_connection_info')
  })

  describe('when the user has an active platform ban', () => {
    beforeEach(async () => {
      userAddress = '0x1234567890123456789012345678901234567890'
      requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.JOIN,
        user_role: CommunityRole.Member
      }
      await components.userModerationDb.createBan({
        bannedAddress: userAddress.toLowerCase(),
        bannedBy,
        reason: 'Harassment'
      })
    })

    it('should respond with a 403 and a message saying the user is platform-banned', async () => {
      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body).toEqual({ error: 'Access denied, platform-banned user' })
    })

    it('should not issue any LiveKit credentials', async () => {
      await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      expect(spyComponents.livekit.generateCredentials).not.toHaveBeenCalled()
    })
  })

  describe('when the user has an active platform ban and is an owner creating a stage', () => {
    beforeEach(async () => {
      userAddress = '0x1234567890123456789012345678901234567890'
      requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.CREATE,
        user_role: CommunityRole.Owner
      }
      await components.userModerationDb.createBan({
        bannedAddress: userAddress.toLowerCase(),
        bannedBy,
        reason: 'Harassment'
      })
    })

    it('should respond with a 403, because a community role does not override a platform ban', async () => {
      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body).toEqual({ error: 'Access denied, platform-banned user' })
    })
  })

  describe('when the user is not banned but last connected from a device another wallet is banned on', () => {
    beforeEach(async () => {
      userAddress = '0x1234567890123456789012345678901234567890'
      requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.JOIN,
        user_role: CommunityRole.Member
      }
      // This route is bearer-authenticated and carries no device identifier, so this is only
      // caught via the device recorded for the wallet on an earlier connection.
      await components.playerConnectionDb.upsertPlayerConnection({
        address: userAddress.toLowerCase(),
        ipAddress: '1.2.3.4',
        deviceId: 'banned-device'
      })
      await components.userModerationDb.createBan({
        bannedAddress: '0x0000000000000000000000000000000000000001',
        bannedBy,
        reason: 'Evasion',
        bannedDeviceId: 'banned-device'
      })
    })

    it('should respond with a 403 even though this wallet has no ban of its own', async () => {
      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body).toEqual({ error: 'Access denied, platform-banned user' })
    })

    it('should not issue any LiveKit credentials', async () => {
      await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      expect(spyComponents.livekit.generateCredentials).not.toHaveBeenCalled()
    })
  })

  describe('when the ban on the user has been lifted', () => {
    beforeEach(async () => {
      userAddress = '0x1234567890123456789012345678901234567890'
      requestBody = {
        community_id: communityId,
        user_address: userAddress,
        action: CommunityVoiceChatAction.JOIN,
        user_role: CommunityRole.Member
      }
      await components.userModerationDb.createBan({
        bannedAddress: userAddress.toLowerCase(),
        bannedBy,
        reason: 'Harassment'
      })
      await components.userModerationDb.liftBan(userAddress.toLowerCase(), bannedBy)
      spyComponents.livekit.generateCredentials.mockResolvedValue({
        url: 'wss://voice.livekit.cloud',
        token: 'community-voice-token'
      })
    })

    afterEach(async () => {
      await components.database.query('DELETE FROM community_voice_chat_users')
    })

    it('should no longer respond with a 403', async () => {
      const response = await makeRequest(components.localFetch, '/community-voice-chat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      expect(response.status).toBe(200)
    })
  })
})
