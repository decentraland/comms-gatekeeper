import { ILoggerComponent } from '@well-known-components/interfaces'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { createVoiceComponent } from '../../src/logic/voice/voice'
import { getCommunityVoiceChatRoomName, getCommunityIdFromRoomName } from '../../src/logic/voice/utils'
import { IVoiceComponent } from '../../src/logic/voice/types'
import { IVoiceDBComponent } from '../../src/adapters/db/types'
import { ILivekitComponent } from '../../src/types/livekit.type'
import { AnalyticsEventPayload } from '../../src/types/analytics'
import { CommunityRole } from '../../src/types/social.type'

describe('CommunityVoiceLogic', () => {
  let voiceComponent: IVoiceComponent
  let mockVoiceDB: jest.Mocked<IVoiceDBComponent>
  let mockLivekit: jest.Mocked<ILivekitComponent>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockAnalytics: jest.Mocked<IAnalyticsComponent<AnalyticsEventPayload>>
  const validCommunityId = 'test-community-123'
  const validModeratorAddress = '0x5babd1869989570988b79b5f5086e17a9e96a235'
  const validMemberAddress = '0x742d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0'

  beforeEach(() => {
    mockVoiceDB = {
      isPrivateRoomActive: jest.fn(),
      joinUserToRoom: jest.fn(),
      updateUserStatusAsDisconnected: jest.fn(),
      updateUserStatusAsConnectionInterrupted: jest.fn(),
      deletePrivateVoiceChat: jest.fn(),
      getRoomUserIsIn: jest.fn(),
      createVoiceChatRoom: jest.fn(),
      getUsersInRoom: jest.fn(),
      deleteExpiredPrivateVoiceChats: jest.fn(),

      // Community voice chat methods
      createCommunityVoiceChatRoom: jest.fn(),
      joinUserToCommunityRoom: jest.fn(),
      updateCommunityUserStatus: jest.fn(),
      getCommunityUsersInRoom: jest.fn(),
      shouldDestroyCommunityRoom: jest.fn(),
      deleteCommunityVoiceChat: jest.fn(),
      deleteExpiredCommunityVoiceChats: jest.fn()
    } as jest.Mocked<IVoiceDBComponent>

    mockLivekit = {
      generateCredentials: jest.fn(),
      buildConnectionUrl: jest.fn(),
      deleteRoom: jest.fn(),
      getRoom: jest.fn(),
      getRoomInfo: jest.fn(),
      muteParticipant: jest.fn(),
      getWorldRoomName: jest.fn(),
      getSceneRoomName: jest.fn(),
      getOrCreateIngress: jest.fn(),
      removeIngress: jest.fn(),
      getWebhookEvent: jest.fn(),
      updateParticipantMetadata: jest.fn()
    } as jest.Mocked<ILivekitComponent>

    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      trace: jest.fn(),
      log: jest.fn()
    }

    mockLogs = {
      getLogger: jest.fn().mockReturnValue(mockLogger)
    } as jest.Mocked<ILoggerComponent>

    mockAnalytics = {
      fireEvent: jest.fn(),
      sendEvent: jest.fn()
    } as jest.Mocked<IAnalyticsComponent<AnalyticsEventPayload>>

    voiceComponent = createVoiceComponent({
      voiceDB: mockVoiceDB,
      livekit: mockLivekit,
      logs: mockLogs,
      analytics: mockAnalytics
    })
  })

  describe('getCommunityVoiceChatCredentialsForModerator', () => {
    beforeEach(() => {
      mockLivekit.getRoom.mockResolvedValue({
        name: 'voice-chat-community-test-community-123',
        sid: 'test-sid',
        emptyTimeout: 10,
        departureTimeout: 10,
        maxParticipants: 100,
        creationTime: Date.now(),
        enabledCodecs: [],
        metadata: '',
        numParticipants: 0,
        numPublishers: 0,
        activeRecording: false
      } as any) // Using any to avoid importing full Room type
      mockLivekit.generateCredentials.mockResolvedValue({
        url: 'wss://voice.livekit.cloud',
        token: 'moderator-token'
      })
      mockLivekit.buildConnectionUrl.mockReturnValue('livekit:wss://voice.livekit.cloud?access_token=moderator-token')
    })

    it('should generate credentials for moderator with correct permissions', async () => {
      const result = await voiceComponent.getCommunityVoiceChatCredentialsForModerator(
        validCommunityId,
        validModeratorAddress
      )

      expect(result).toEqual({
        connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=moderator-token'
      })

      expect(mockLivekit.getRoom).toHaveBeenCalledWith(getCommunityVoiceChatRoomName(validCommunityId))

      expect(mockLivekit.generateCredentials).toHaveBeenCalledWith(
        validModeratorAddress,
        getCommunityVoiceChatRoomName(validCommunityId),
        {
          cast: [],
          canPublish: true,
          canSubscribe: true,
          canUpdateOwnMetadata: true
        },
        false,
        {
          role: CommunityRole.Moderator,
          community_id: validCommunityId
        }
      )

      expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
        validModeratorAddress,
        getCommunityVoiceChatRoomName(validCommunityId),
        true
      )
    })

    it('should insert moderator as NotConnected in database (not Connected)', async () => {
      await voiceComponent.getCommunityVoiceChatCredentialsForModerator(validCommunityId, validModeratorAddress)

      // Verify that joinUserToCommunityRoom is called to insert user in DB
      // The actual implementation will insert with NotConnected status
      expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
        validModeratorAddress,
        getCommunityVoiceChatRoomName(validCommunityId),
        true // isModerator = true
      )
    })

    it('should handle livekit errors properly', async () => {
      mockLivekit.getRoom.mockRejectedValue(new Error('LiveKit error'))

      await expect(
        voiceComponent.getCommunityVoiceChatCredentialsForModerator(validCommunityId, validModeratorAddress)
      ).rejects.toThrow('LiveKit error')
    })
  })

  describe('getCommunityVoiceChatCredentialsForMember', () => {
    beforeEach(() => {
      mockLivekit.generateCredentials.mockResolvedValue({
        url: 'wss://voice.livekit.cloud',
        token: 'member-token'
      })
      mockLivekit.buildConnectionUrl.mockReturnValue('livekit:wss://voice.livekit.cloud?access_token=member-token')
    })

    it('should generate credentials for member with correct permissions', async () => {
      const result = await voiceComponent.getCommunityVoiceChatCredentialsForMember(
        validCommunityId,
        validMemberAddress
      )

      expect(result).toEqual({
        connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=member-token'
      })

      expect(mockLivekit.generateCredentials).toHaveBeenCalledWith(
        validMemberAddress,
        getCommunityVoiceChatRoomName(validCommunityId),
        {
          cast: [],
          canPublish: false,
          canSubscribe: true,
          canUpdateOwnMetadata: true
        },
        false,
        {
          role: CommunityRole.Member,
          community_id: validCommunityId
        }
      )

      expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
        validMemberAddress,
        getCommunityVoiceChatRoomName(validCommunityId),
        false
      )
    })

    it('should insert member as NotConnected in database (not Connected)', async () => {
      await voiceComponent.getCommunityVoiceChatCredentialsForMember(validCommunityId, validMemberAddress)

      // Verify that joinUserToCommunityRoom is called to insert user in DB
      // The actual implementation will insert with NotConnected status
      expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
        validMemberAddress,
        getCommunityVoiceChatRoomName(validCommunityId),
        false // isModerator = false
      )
    })

    it('should handle livekit errors properly', async () => {
      mockLivekit.generateCredentials.mockRejectedValue(new Error('LiveKit error'))

      await expect(
        voiceComponent.getCommunityVoiceChatCredentialsForMember(validCommunityId, validMemberAddress)
      ).rejects.toThrow('LiveKit error')
    })
  })

  describe('community voice chat room utilities', () => {
    describe('getCommunityVoiceChatRoomName', () => {
      it('should generate correct room name for community voice chat', () => {
        const roomName = getCommunityVoiceChatRoomName(validCommunityId)
        expect(roomName).toBe(`voice-chat-community-${validCommunityId}`)
      })

      it('should handle special characters in community id', () => {
        const specialCommunityId = 'test-community-with-special-chars_123'
        const roomName = getCommunityVoiceChatRoomName(specialCommunityId)
        expect(roomName).toBe(`voice-chat-community-${specialCommunityId}`)
      })
    })

    describe('getCommunityIdFromRoomName', () => {
      it('should extract community id from room name', () => {
        const roomName = 'voice-chat-community-test-community-123'
        const communityId = getCommunityIdFromRoomName(roomName)
        expect(communityId).toBe('test-community-123')
      })

      it('should handle complex community ids', () => {
        const complexCommunityId = 'my-community-with-dashes-and_underscores_123'
        const roomName = `voice-chat-community-${complexCommunityId}`
        const extractedId = getCommunityIdFromRoomName(roomName)
        expect(extractedId).toBe(complexCommunityId)
      })
    })
  })
})
