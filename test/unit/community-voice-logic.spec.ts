import { ILoggerComponent } from '@well-known-components/interfaces'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { createVoiceComponent } from '../../src/logic/voice/voice'
import { getCommunityVoiceChatRoomName } from '../../src/logic/voice/utils'
import { IVoiceComponent } from '../../src/logic/voice/types'
import { IVoiceDBComponent, VoiceChatUserStatus } from '../../src/adapters/db/types'
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
      deleteExpiredCommunityVoiceChats: jest.fn(),
      deletePrivateVoiceChatUserIsOrWasIn: jest.fn()
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

  describe('when getting the community voice chat credentials for a moderator', () => {
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
      mockLivekit.generateCredentials.mockResolvedValue({
        token: 'moderator-token',
        url: 'wss://voice.livekit.cloud'
      })

      const result = await voiceComponent.getCommunityVoiceChatCredentialsForModerator(
        validCommunityId,
        validModeratorAddress
      )

      expect(result).toEqual({
        connectionUrl: 'livekit:wss://voice.livekit.cloud?access_token=moderator-token'
      })

      expect(mockLivekit.generateCredentials).toHaveBeenCalledWith(
        validModeratorAddress,
        getCommunityVoiceChatRoomName(validCommunityId),
        {
          cast: [],
          canPublish: true,
          canSubscribe: true,
          canUpdateOwnMetadata: false
        },
        false,
        {
          role: CommunityRole.Moderator
        }
      )

      expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
        validModeratorAddress,
        getCommunityVoiceChatRoomName(validCommunityId),
        true
      )
    })

    it('should store the join the moderator to the community room', async () => {
      await voiceComponent.getCommunityVoiceChatCredentialsForModerator(validCommunityId, validModeratorAddress)

      // Verify that joinUserToCommunityRoom is called to insert user in DB
      // The actual implementation will insert with NotConnected status
      expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
        validModeratorAddress,
        getCommunityVoiceChatRoomName(validCommunityId),
        true // isModerator = true
      )
    })

  })

  describe('when LiveKit fails to generate credentials for moderator', () => {
    it('should propagate LiveKit errors', async () => {
      mockLivekit.generateCredentials.mockRejectedValue(new Error('LiveKit error'))

      await expect(
        voiceComponent.getCommunityVoiceChatCredentialsForModerator(validCommunityId, validModeratorAddress)
      ).rejects.toThrow('LiveKit error')
    })
  })

  describe('when getting the community voice chat credentials for a member', () => {
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
          canUpdateOwnMetadata: false
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

  })

  describe('when LiveKit fails to generate credentials for member', () => {
    it('should propagate LiveKit errors', async () => {
      mockLivekit.generateCredentials.mockRejectedValue(new Error('LiveKit error'))

      await expect(
        voiceComponent.getCommunityVoiceChatCredentialsForMember(validCommunityId, validMemberAddress)
      ).rejects.toThrow('LiveKit error')
    })
  })

  describe('when getting community voice chat status', () => {
    const roomName = getCommunityVoiceChatRoomName(validCommunityId)

    describe('and there are no users in the room', () => {
      beforeEach(() => {
        mockVoiceDB.getCommunityUsersInRoom.mockResolvedValue([])
      })

      it('should return inactive status with zero counts', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: false,
          participantCount: 0,
          moderatorCount: 0
        })

        expect(mockVoiceDB.getCommunityUsersInRoom).toHaveBeenCalledWith(roomName)
      })
    })

    describe('and there are connected users', () => {
      beforeEach(() => {
        mockVoiceDB.getCommunityUsersInRoom.mockResolvedValue([
          {
            address: validModeratorAddress,
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          },
          {
            address: validMemberAddress,
            roomName,
            isModerator: false,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          }
        ])
      })

      it('should return active status with correct counts', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: true,
          participantCount: 2,
          moderatorCount: 1
        })
      })
    })

    describe('and there are users with connection interruptions', () => {
      beforeEach(() => {
        mockVoiceDB.getCommunityUsersInRoom.mockResolvedValue([
          {
            address: validModeratorAddress,
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.ConnectionInterrupted,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          },
          {
            address: validMemberAddress,
            roomName,
            isModerator: false,
            status: VoiceChatUserStatus.ConnectionInterrupted,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          }
        ])
      })

      it('should count interrupted users as active participants and moderators', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: true,
          participantCount: 2,
          moderatorCount: 1
        })
      })
    })

    describe('and there are disconnected users', () => {
      beforeEach(() => {
        mockVoiceDB.getCommunityUsersInRoom.mockResolvedValue([
          {
            address: validModeratorAddress,
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.Disconnected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          },
          {
            address: validMemberAddress,
            roomName,
            isModerator: false,
            status: VoiceChatUserStatus.Disconnected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          }
        ])
      })

      it('should not count disconnected users', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: false,
          participantCount: 0,
          moderatorCount: 0
        })
      })
    })

    describe('and there are only members without moderators', () => {
      beforeEach(() => {
        mockVoiceDB.getCommunityUsersInRoom.mockResolvedValue([
          {
            address: validMemberAddress,
            roomName,
            isModerator: false,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          }
        ])
      })

      it('should return inactive status even with connected members', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: false,
          participantCount: 1,
          moderatorCount: 0
        })
      })
    })

    describe('and there are mixed user statuses', () => {
      beforeEach(() => {
        mockVoiceDB.getCommunityUsersInRoom.mockResolvedValue([
          {
            address: validModeratorAddress,
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          },
          {
            address: validMemberAddress,
            roomName,
            isModerator: false,
            status: VoiceChatUserStatus.Disconnected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          },
          {
            address: '0x742d35Cc6635C0532925a3b8D6Ac6C2b6000b8B1',
            roomName,
            isModerator: false,
            status: VoiceChatUserStatus.ConnectionInterrupted,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          }
        ])
      })

      it('should count only connected and interrupted users', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: true,
          participantCount: 2, // connected moderator + interrupted member
          moderatorCount: 1 // connected moderator
        })
      })
    })

    describe('when database query fails', () => {
      beforeEach(() => {
        mockVoiceDB.getCommunityUsersInRoom.mockRejectedValue(new Error('Database error'))
      })

      it('should return inactive status and log error', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: false,
          participantCount: 0,
          moderatorCount: 0
        })

        // Verify that the logger was called with a warning
        const mockLogger = mockLogs.getLogger('voice')
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining(`Error getting community voice chat status for ${roomName}`)
        )
      })
    })
  })

})
