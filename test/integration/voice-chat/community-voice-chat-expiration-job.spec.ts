import { test } from '../../components'
import { VoiceChatUserStatus } from '../../../src/adapters/db/types'
import { setCommunityUserStatus } from '../../db-utils'

test('Community voice chat expiration job', ({ components }) => {
  const communityId = 'test-community-expiration'
  const moderatorAddress = '0x1234567890123456789012345678901234567890'
  const memberAddress = '0x1234567890123456789012345678901234567891'

  let roomName: string
  let VOICE_CHAT_CONNECTION_INTERRUPTED_TTL: number
  let VOICE_CHAT_INITIAL_CONNECTION_TTL: number
  let COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL: number

  beforeEach(async () => {
    roomName = components.livekit.getCommunityVoiceChatRoomName(communityId)
    // Get TTL values from config - this is critical for the tests to work correctly
    VOICE_CHAT_CONNECTION_INTERRUPTED_TTL = await components.config.requireNumber(
      'VOICE_CHAT_CONNECTION_INTERRUPTED_TTL'
    )
    VOICE_CHAT_INITIAL_CONNECTION_TTL = await components.config.requireNumber('VOICE_CHAT_INITIAL_CONNECTION_TTL')
    COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL = await components.config.requireNumber(
      'COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL'
    )
  })

  afterEach(async () => {
    await components.voiceDB.deleteCommunityVoiceChat(roomName)
  })

  describe('when having a community room with a moderator', () => {
    beforeEach(async () => {
      // Create the base context: community room with a moderator
      await components.voiceDB.joinUserToCommunityRoom(moderatorAddress, roomName, true)
    })

    describe('and the moderator is actively connected', () => {
      beforeEach(async () => {
        await components.voiceDB.updateCommunityUserStatus(moderatorAddress, roomName, VoiceChatUserStatus.Connected)
      })

      it('should NOT be deleted by the expiration job', async () => {
        // Test the direct database function - active moderator should keep room alive
        const expiredRoomsBefore = await components.voiceDB.deleteExpiredCommunityVoiceChats()
        expect(expiredRoomsBefore).not.toContain(roomName)

        // Run the full expiration job
        await components.voice.expireCommunityVoiceChats()

        // Verify the room still exists
        const usersAfterExpiration = await components.voiceDB.getCommunityUsersInRoom(roomName)
        expect(usersAfterExpiration).toHaveLength(1)
      })
    })

    describe('and the moderator had a recent connection interruption', () => {
      beforeEach(async () => {
        await components.voiceDB.updateCommunityUserStatus(
          moderatorAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted
        )
        // Set the interruption to be within grace period (half of the TTL)
        const withinGracePeriod = Date.now() - VOICE_CHAT_CONNECTION_INTERRUPTED_TTL / 2
        await setCommunityUserStatus(
          components.database,
          moderatorAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted,
          withinGracePeriod
        )
      })

      it('should NOT be deleted by the expiration job', async () => {
        // Test the direct database function to ensure consistency - THIS WOULD HAVE FAILED BEFORE THE FIX
        const expiredRoomsBefore = await components.voiceDB.deleteExpiredCommunityVoiceChats()
        expect(expiredRoomsBefore).not.toContain(roomName)

        // Run the full expiration job
        await components.voice.expireCommunityVoiceChats()

        // Verify the room still exists
        const usersAfterExpiration = await components.voiceDB.getCommunityUsersInRoom(roomName)
        expect(usersAfterExpiration).toHaveLength(1)
      })
    })

    describe('and the moderator had connection interruption more than 5 minutes ago', () => {
      beforeEach(async () => {
        await components.voiceDB.updateCommunityUserStatus(
          moderatorAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted
        )
        // Set the interruption to be beyond BOTH grace period AND no-moderator TTL
        const beyondBothTtls =
          Date.now() - Math.max(VOICE_CHAT_CONNECTION_INTERRUPTED_TTL, COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL) - 60000
        await setCommunityUserStatus(
          components.database,
          moderatorAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted,
          beyondBothTtls
        )
      })

      it('should be deleted by the expiration job', async () => {
        // Test the direct database function - moderator inactive beyond both TTLs
        const expiredRooms = await components.voiceDB.deleteExpiredCommunityVoiceChats()
        expect(expiredRooms).toContain(roomName)

        // Verify the room was deleted
        const usersAfterExpiration = await components.voiceDB.getCommunityUsersInRoom(roomName)
        expect(usersAfterExpiration).toHaveLength(0)
      })
    })

    describe('and the moderator became inactive but not enough time passed for no-moderator TTL', () => {
      beforeEach(async () => {
        await components.voiceDB.updateCommunityUserStatus(
          moderatorAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted
        )
        // Set interruption beyond ConnectionInterrupted TTL but within NoModerator TTL
        const beyondConnectionTtlButWithinNoModeratorTtl = Date.now() - VOICE_CHAT_CONNECTION_INTERRUPTED_TTL * 2
        // Ensure this is still within COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL
        if (VOICE_CHAT_CONNECTION_INTERRUPTED_TTL * 2 >= COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL) {
          // If ConnectionInterrupted TTL is too close to NoModerator TTL, use a smaller gap
          const smallGap = Date.now() - COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL / 2
          await setCommunityUserStatus(
            components.database,
            moderatorAddress,
            roomName,
            VoiceChatUserStatus.ConnectionInterrupted,
            smallGap
          )
        } else {
          await setCommunityUserStatus(
            components.database,
            moderatorAddress,
            roomName,
            VoiceChatUserStatus.ConnectionInterrupted,
            beyondConnectionTtlButWithinNoModeratorTtl
          )
        }
      })

      it('should NOT be deleted yet - waiting for no-moderator TTL', async () => {
        // Moderator is no longer "active" but we haven't reached the no-moderator TTL
        // Test the direct database function to ensure consistency
        const expiredRooms = await components.voiceDB.deleteExpiredCommunityVoiceChats()
        expect(expiredRooms).not.toContain(roomName)

        // Verify the room still exists
        const usersAfterExpiration = await components.voiceDB.getCommunityUsersInRoom(roomName)
        expect(usersAfterExpiration).toHaveLength(1)
      })
    })

    describe('and enough time passed since no active moderators', () => {
      beforeEach(async () => {
        await components.voiceDB.updateCommunityUserStatus(
          moderatorAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted
        )
        // Set interruption beyond both ConnectionInterrupted TTL AND NoModerator TTL
        const beyondBothTtls =
          Date.now() - Math.max(VOICE_CHAT_CONNECTION_INTERRUPTED_TTL, COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL) - 60000
        await setCommunityUserStatus(
          components.database,
          moderatorAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted,
          beyondBothTtls
        )
      })

      it('should be deleted by the expiration job after no-moderator TTL', async () => {
        // Room should be destroyed - no active moderators for longer than no-moderator TTL
        // Test the direct database function to ensure consistency
        const expiredRooms = await components.voiceDB.deleteExpiredCommunityVoiceChats()
        expect(expiredRooms).toContain(roomName)

        // Verify the room was deleted
        const usersAfterExpiration = await components.voiceDB.getCommunityUsersInRoom(roomName)
        expect(usersAfterExpiration).toHaveLength(0)
      })
    })
  })

  describe('when having a community room with moderator and members', () => {
    beforeEach(async () => {
      // Create the base context: community room with moderator and member
      await components.voiceDB.joinUserToCommunityRoom(moderatorAddress, roomName, true)
      await components.voiceDB.joinUserToCommunityRoom(memberAddress, roomName, false)
    })

    describe('and the moderator had connection interruption more than 5 minutes ago', () => {
      beforeEach(async () => {
        await components.voiceDB.updateCommunityUserStatus(
          moderatorAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted
        )
        // Set the interruption to be beyond BOTH grace period AND no-moderator TTL
        const beyondBothTtls =
          Date.now() - Math.max(VOICE_CHAT_CONNECTION_INTERRUPTED_TTL, COMMUNITY_VOICE_CHAT_NO_MODERATOR_TTL) - 60000
        await setCommunityUserStatus(
          components.database,
          moderatorAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted,
          beyondBothTtls
        )
      })

      it('should be deleted by the expiration job even with active members', async () => {
        // Verify room exists with 2 users
        const usersInRoom = await components.voiceDB.getCommunityUsersInRoom(roomName)
        expect(usersInRoom).toHaveLength(2)

        // Test the direct database function - should delete room despite active members
        const expiredRooms = await components.voiceDB.deleteExpiredCommunityVoiceChats()
        expect(expiredRooms).toContain(roomName)

        // Verify the room was deleted
        const usersAfterExpiration = await components.voiceDB.getCommunityUsersInRoom(roomName)
        expect(usersAfterExpiration).toHaveLength(0)
      })
    })
  })

  describe('when having a community room with only members', () => {
    beforeEach(async () => {
      // Create the base context: community room with only members, no moderators
      await components.voiceDB.joinUserToCommunityRoom(memberAddress, roomName, false)
    })

    it('should be deleted by the expiration job immediately', async () => {
      // Test the direct database function - no moderators should delete room immediately
      const expiredRooms = await components.voiceDB.deleteExpiredCommunityVoiceChats()
      expect(expiredRooms).toContain(roomName)

      // Verify the room was deleted
      const usersAfterExpiration = await components.voiceDB.getCommunityUsersInRoom(roomName)
      expect(usersAfterExpiration).toHaveLength(0)
    })
  })
})
