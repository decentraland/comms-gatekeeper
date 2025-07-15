import { test } from '../../components'
import { getCommunityVoiceChatRoomName } from '../../../src/logic/voice/utils'
import { VoiceChatUserStatus } from '../../../src/adapters/db/types'
import { setCommunityUserStatus } from '../../db-utils'

test('Community voice chat expiration job', ({ components }) => {
  const communityId = 'test-community-expiration'
  const roomName = getCommunityVoiceChatRoomName(communityId)
  const moderatorAddress = '0x1234567890123456789012345678901234567890'
  const memberAddress = '0x1234567890123456789012345678901234567891'

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
        // Verify the room should NOT be destroyed
        const shouldDestroy = await components.voiceDB.shouldDestroyCommunityRoom(roomName)
        expect(shouldDestroy).toBe(false)

        // Run the expiration job
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
        // Set the interruption to 2 minutes ago (within grace period)
        const twoMinutesAgo = Date.now() - 2 * 60 * 1000
        await setCommunityUserStatus(components.database, moderatorAddress, roomName, VoiceChatUserStatus.ConnectionInterrupted, twoMinutesAgo)
      })

      it('should NOT be deleted by the expiration job', async () => {
        // Verify the room should NOT be destroyed (grace period)
        const shouldDestroy = await components.voiceDB.shouldDestroyCommunityRoom(roomName)
        expect(shouldDestroy).toBe(false)

        // Run the expiration job
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
        // Set the interruption to 6 minutes ago (beyond grace period)
        const sixMinutesAgo = Date.now() - 6 * 60 * 1000
        await setCommunityUserStatus(components.database, moderatorAddress, roomName, VoiceChatUserStatus.ConnectionInterrupted, sixMinutesAgo)
      })

      it('should be deleted by the expiration job', async () => {
        // Verify the room should be destroyed
        const shouldDestroy = await components.voiceDB.shouldDestroyCommunityRoom(roomName)
        expect(shouldDestroy).toBe(true)

        // Run the expiration job
        await components.voice.expireCommunityVoiceChats()

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
        // Set the interruption to 6 minutes ago (beyond grace period)
        const sixMinutesAgo = Date.now() - 6 * 60 * 1000
        await setCommunityUserStatus(components.database, moderatorAddress, roomName, VoiceChatUserStatus.ConnectionInterrupted, sixMinutesAgo)
      })

      it('should be deleted by the expiration job even with active members', async () => {
        // Verify room exists with 2 users
        const usersInRoom = await components.voiceDB.getCommunityUsersInRoom(roomName)
        expect(usersInRoom).toHaveLength(2)

        // Verify the room should be destroyed
        const shouldDestroy = await components.voiceDB.shouldDestroyCommunityRoom(roomName)
        expect(shouldDestroy).toBe(true)

        // Run the expiration job
        await components.voice.expireCommunityVoiceChats()

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
      // Verify the room should be destroyed (no moderators at all)
      const shouldDestroy = await components.voiceDB.shouldDestroyCommunityRoom(roomName)
      expect(shouldDestroy).toBe(true)

      // Run the expiration job
      await components.voice.expireCommunityVoiceChats()

      // Verify the room was deleted
      const usersAfterExpiration = await components.voiceDB.getCommunityUsersInRoom(roomName)
      expect(usersAfterExpiration).toHaveLength(0)
    })
  })
})
