import { test } from '../../components'
import { getCommunityVoiceChatRoomName } from '../../../src/logic/voice/utils'
import { VoiceChatUserStatus } from '../../../src/adapters/db/types'

test('Community voice chat expiration job', ({ components }) => {
  const communityId = 'test-community-expiration'
  const roomName = getCommunityVoiceChatRoomName(communityId)
  const moderatorAddress = '0x1234567890123456789012345678901234567890'
  const memberAddress = '0x1234567890123456789012345678901234567891'

  beforeEach(async () => {
    // Clean up any existing test data
    try {
      await components.voiceDB.deleteCommunityVoiceChat(roomName)
    } catch (error) {
      // Ignore if room doesn't exist
    }
  })

  afterEach(async () => {
    try {
      await components.voiceDB.deleteCommunityVoiceChat(roomName)
    } catch (error) {
      // Ignore if room doesn't exist
    }
  })

  describe('when a community room has no active moderators for more than 5 minutes', () => {
    it('should be deleted by the expiration job', async () => {
      // Create a community room with a moderator
      await components.voiceDB.joinUserToCommunityRoom(moderatorAddress, roomName, true)
      
      // Add a member
      await components.voiceDB.joinUserToCommunityRoom(memberAddress, roomName, false)
      
      // Verify room exists
      const usersInRoom = await components.voiceDB.getCommunityUsersInRoom(roomName)
      expect(usersInRoom).toHaveLength(2)
      
      // Simulate moderator disconnecting (but not leaving voluntarily)
      await components.voiceDB.updateCommunityUserStatus(
        moderatorAddress, 
        roomName, 
        VoiceChatUserStatus.ConnectionInterrupted
      )
      
      // Move the moderator's disconnect time to 6 minutes ago (simulate time passing)
      const sixMinutesAgo = Date.now() - (6 * 60 * 1000)
      await components.database.query(
        `UPDATE community_voice_chat_users 
         SET status_updated_at = ${sixMinutesAgo} 
         WHERE address = '${moderatorAddress}' AND room_name = '${roomName}'`
      )
      
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

  describe('when a community room has active moderators', () => {
    it('should NOT be deleted by the expiration job', async () => {
      // Create a community room with a moderator
      await components.voiceDB.joinUserToCommunityRoom(moderatorAddress, roomName, true)
      
      // Add a member
      await components.voiceDB.joinUserToCommunityRoom(memberAddress, roomName, false)
      
      // Keep moderator connected
      await components.voiceDB.updateCommunityUserStatus(
        moderatorAddress, 
        roomName, 
        VoiceChatUserStatus.Connected
      )
      
      // Verify the room should NOT be destroyed
      const shouldDestroy = await components.voiceDB.shouldDestroyCommunityRoom(roomName)
      expect(shouldDestroy).toBe(false)
      
      // Run the expiration job
      await components.voice.expireCommunityVoiceChats()
      
      // Verify the room still exists
      const usersAfterExpiration = await components.voiceDB.getCommunityUsersInRoom(roomName)
      expect(usersAfterExpiration).toHaveLength(2)
    })
  })

  describe('when a community room has a moderator with recent connection interruption', () => {
    it('should NOT be deleted by the expiration job', async () => {
      // Create a community room with a moderator
      await components.voiceDB.joinUserToCommunityRoom(moderatorAddress, roomName, true)
      
      // Simulate moderator disconnecting recently (2 minutes ago)
      await components.voiceDB.updateCommunityUserStatus(
        moderatorAddress, 
        roomName, 
        VoiceChatUserStatus.ConnectionInterrupted
      )
      
      // Move the moderator's disconnect time to 2 minutes ago (within tolerance)
      const twoMinutesAgo = Date.now() - (2 * 60 * 1000)
      await components.database.query(
        `UPDATE community_voice_chat_users 
         SET status_updated_at = ${twoMinutesAgo} 
         WHERE address = '${moderatorAddress}' AND room_name = '${roomName}'`
      )
      
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

  describe('when a community room has only members (no moderators)', () => {
    it('should be deleted by the expiration job immediately', async () => {
      // Create a community room with only members, no moderators
      await components.voiceDB.joinUserToCommunityRoom(memberAddress, roomName, false)
      
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
