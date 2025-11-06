import { ILoggerComponent } from '@well-known-components/interfaces'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { IPublisherComponent } from '@dcl/sns-component'
import { createVoiceComponent } from '../../src/logic/voice/voice'
import { getCommunityVoiceChatRoomName } from '../../src/logic/voice/utils'
import { IVoiceComponent } from '../../src/logic/voice/types'
import { IVoiceDBComponent, VoiceChatUserStatus } from '../../src/adapters/db/types'
import { ILivekitComponent } from '../../src/types/livekit.type'
import { AnalyticsEventPayload } from '../../src/types/analytics'
import { CommunityRole } from '../../src/types/social.type'
import { CommunityVoiceChatAction } from '../../src/types/community-voice'
import { createLivekitMockedComponent } from '../mocks/livekit-mock'
import { createVoiceDBMockedComponent } from '../mocks/voice-db-mock'
import { createPublisherMockedComponent } from '../mocks/publisher-mock'

describe('CommunityVoiceLogic', () => {
  let voiceComponent: IVoiceComponent
  let mockVoiceDB: jest.Mocked<IVoiceDBComponent>
  let mockLivekit: jest.Mocked<ILivekitComponent>
  let mockLogs: jest.Mocked<ILoggerComponent>
  let mockAnalytics: jest.Mocked<IAnalyticsComponent<AnalyticsEventPayload>>
  let mockPublisher: jest.Mocked<IPublisherComponent>

  const validCommunityId = 'test-community-123'
  const validModeratorAddress = '0x5babd1869989570988b79b5f5086e17a9e96a235'
  const validMemberAddress = '0x742d35Cc6635C0532925a3b8D6Ac6C2b6000b8B0'
  const validUserAddress = '0x1234567890123456789012345678901234567890'

  beforeEach(() => {
    mockVoiceDB = createVoiceDBMockedComponent()
    mockLivekit = createLivekitMockedComponent()

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

    mockPublisher = createPublisherMockedComponent()

    voiceComponent = createVoiceComponent({
      voiceDB: mockVoiceDB,
      livekit: mockLivekit,
      logs: mockLogs,
      analytics: mockAnalytics,
      publisher: mockPublisher
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

    describe('when profile data is available', () => {
      const profileData = {
        name: 'TestModerator',
        has_claimed_name: true,
        profile_picture_url: 'https://example.com/avatar.png'
      }

      beforeEach(() => {
        mockLivekit.generateCredentials.mockResolvedValue({
          token: 'moderator-token',
          url: 'wss://voice.livekit.cloud'
        })
      })

      it('should generate credentials for moderator with correct permissions and profile data', async () => {
        const result = await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validModeratorAddress,
          CommunityRole.Moderator,
          {
            name: 'TestModerator',
            has_claimed_name: true,
            profile_picture_url: 'https://example.com/avatar.png'
          },
          CommunityVoiceChatAction.CREATE
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
            role: CommunityRole.Moderator,
            isSpeaker: true,
            muted: false,
            name: 'TestModerator',
            hasClaimedName: true,
            profilePictureUrl: 'https://example.com/avatar.png'
          }
        )

        expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
          validModeratorAddress,
          getCommunityVoiceChatRoomName(validCommunityId),
          true
        )
      })
    })

    describe('when profile data is not available', () => {
      beforeEach(() => {
        mockLivekit.generateCredentials.mockResolvedValue({
          token: 'moderator-token',
          url: 'wss://voice.livekit.cloud'
        })
      })

      it('should generate credentials for moderator with correct permissions without profile data', async () => {
        const result = await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validModeratorAddress,
          CommunityRole.Moderator,
          undefined,
          CommunityVoiceChatAction.CREATE
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
            role: CommunityRole.Moderator,
            isSpeaker: true,
            muted: false
          }
        )

        expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
          validModeratorAddress,
          getCommunityVoiceChatRoomName(validCommunityId),
          true
        )
      })
    })

    describe('when assigning the metadata to the user', () => {
      beforeEach(() => {
        mockLivekit.generateCredentials.mockResolvedValue({
          url: 'wss://voice.livekit.cloud',
          token: 'moderator-token'
        })
      })

      it('should assign isSpeaker: true by default to moderators', async () => {
        await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validModeratorAddress,
          CommunityRole.Moderator,
          undefined,
          CommunityVoiceChatAction.CREATE
        )

        // Verify that the metadata passed to generateCredentials includes isSpeaker: true
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
            role: CommunityRole.Moderator,
            isSpeaker: true,
            muted: false
          }
        )
      })

      it('should handle different roles correctly with getCommunityVoiceChatCredentialsWithRole', async () => {
        // Test Owner role - owners are speakers by default
        await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validModeratorAddress,
          CommunityRole.Owner,
          undefined,
          CommunityVoiceChatAction.CREATE
        )
        expect(mockLivekit.generateCredentials).toHaveBeenCalledWith(
          validModeratorAddress,
          getCommunityVoiceChatRoomName(validCommunityId),
          {
            cast: [],
            canPublish: true, // Just owners are speakers by default
            canSubscribe: true,
            canUpdateOwnMetadata: false
          },
          false,
          expect.objectContaining({
            role: CommunityRole.Owner,
            isSpeaker: true // Owners are speakers by default
          })
        )

        // Test Moderator role - moderators are speakers by default
        await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validModeratorAddress,
          CommunityRole.Moderator
        )
        expect(mockLivekit.generateCredentials).toHaveBeenCalledWith(
          validModeratorAddress,
          getCommunityVoiceChatRoomName(validCommunityId),
          {
            cast: [],
            canPublish: false, // Moderators are not speakers by default unless they create the room
            canSubscribe: true,
            canUpdateOwnMetadata: false
          },
          false,
          expect.objectContaining({
            role: CommunityRole.Moderator,
            isSpeaker: false // Moderators are not speakers by default unless they create the room
          })
        )

        // Test Member role - members are listeners by default
        await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validMemberAddress,
          CommunityRole.Member
        )
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
          expect.objectContaining({
            role: CommunityRole.Member,
            isSpeaker: false
          })
        )

        // Test None role - non-members are listeners
        await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validMemberAddress,
          CommunityRole.None
        )
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
          expect.objectContaining({
            role: CommunityRole.None,
            isSpeaker: false
          })
        )
      })
    })
  })

  describe('when LiveKit fails to generate credentials for moderator', () => {
    it('should propagate LiveKit errors', async () => {
      mockLivekit.generateCredentials.mockRejectedValue(new Error('LiveKit error'))

      await expect(
        voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validModeratorAddress,
          CommunityRole.Moderator,
          undefined,
          CommunityVoiceChatAction.CREATE
        )
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

    describe('when profile data is available', () => {
      const profileData = {
        name: 'TestMember',
        has_claimed_name: false,
        profile_picture_url: 'https://example.com/member-avatar.png'
      }

      beforeEach(() => {
        mockLivekit.generateCredentials.mockResolvedValue({
          url: 'wss://voice.livekit.cloud',
          token: 'member-token'
        })
      })

      it('should generate credentials for member with correct permissions and profile data', async () => {
        const result = await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validMemberAddress,
          CommunityRole.Member,
          {
            name: 'TestMember',
            has_claimed_name: false,
            profile_picture_url: 'https://example.com/member-avatar.png'
          }
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
            isSpeaker: false,
            muted: false,
            name: 'TestMember',
            hasClaimedName: false,
            profilePictureUrl: 'https://example.com/member-avatar.png'
          }
        )

        expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
          validMemberAddress,
          getCommunityVoiceChatRoomName(validCommunityId),
          false
        )
      })
    })

    describe('when profile data is not available', () => {
      beforeEach(() => {
        mockLivekit.generateCredentials.mockResolvedValue({
          url: 'wss://voice.livekit.cloud',
          token: 'member-token'
        })
      })

      it('should generate credentials for member with correct permissions without profile data', async () => {
        const result = await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validMemberAddress,
          CommunityRole.Member,
          undefined
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
            isSpeaker: false,
            muted: false
          }
        )

        expect(mockVoiceDB.joinUserToCommunityRoom).toHaveBeenCalledWith(
          validMemberAddress,
          getCommunityVoiceChatRoomName(validCommunityId),
          false
        )
      })
    })
    describe('when assigning the metadata to the user', () => {
      beforeEach(() => {
        mockLivekit.generateCredentials.mockResolvedValue({
          url: 'wss://voice.livekit.cloud',
          token: 'member-token'
        })
      })

      it('should assign isSpeaker: false by default to members', async () => {
        await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validMemberAddress,
          CommunityRole.Member,
          undefined
        )

        // Verify that the metadata passed to generateCredentials includes isSpeaker: false
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
            isSpeaker: false,
            muted: false
          }
        )
      })
    })
  })

  describe('when LiveKit fails to generate credentials for member', () => {
    it('should propagate LiveKit errors', async () => {
      mockLivekit.generateCredentials.mockRejectedValue(new Error('LiveKit error'))

      await expect(
        voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          validCommunityId,
          validMemberAddress,
          CommunityRole.Member,
          undefined
        )
      ).rejects.toThrow('LiveKit error')
    })
  })

  describe('when getting community voice chat status', () => {
    const roomName = getCommunityVoiceChatRoomName(validCommunityId)

    describe('and the room is not active', () => {
      beforeEach(() => {
        mockVoiceDB.isCommunityRoomActive.mockResolvedValue(false)
      })

      it('should return inactive status with zero counts', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: false,
          participantCount: 0,
          moderatorCount: 0
        })

        expect(mockVoiceDB.isCommunityRoomActive).toHaveBeenCalledWith(roomName)
        expect(mockVoiceDB.getCommunityUsersInRoom).not.toHaveBeenCalled()
      })
    })

    describe('and the room is active', () => {
      beforeEach(() => {
        mockVoiceDB.isCommunityRoomActive.mockResolvedValue(true)
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
        // Both users are connected, so they should be considered active
        mockVoiceDB.isActiveCommunityUser.mockReturnValue(true)
      })

      it('should return active status with correct counts', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: true,
          participantCount: 2,
          moderatorCount: 1
        })

        expect(mockVoiceDB.isCommunityRoomActive).toHaveBeenCalledWith(roomName)
        expect(mockVoiceDB.getCommunityUsersInRoom).toHaveBeenCalledWith(roomName)
        expect(mockVoiceDB.isActiveCommunityUser).toHaveBeenCalledTimes(3) // 2 for participants + 1 for moderator filter
      })
    })

    describe('and the room has a moderator who just created it but has not connected yet', () => {
      beforeEach(() => {
        mockVoiceDB.isCommunityRoomActive.mockResolvedValue(true)
        const now = Date.now()
        mockVoiceDB.getCommunityUsersInRoom.mockResolvedValue([
          {
            address: validModeratorAddress,
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.NotConnected, // Just created, not connected yet
            joinedAt: now, // Just joined, within TTL
            statusUpdatedAt: now
          }
        ])
        // Moderator is NotConnected but within TTL, should be considered active
        mockVoiceDB.isActiveCommunityUser.mockReturnValue(true)
      })

      it('should return active status and count the moderator as active participant', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: true,
          participantCount: 1, // Should count the NotConnected moderator within TTL
          moderatorCount: 1 // Should count the NotConnected moderator within TTL
        })

        expect(mockVoiceDB.isCommunityRoomActive).toHaveBeenCalledWith(roomName)
        expect(mockVoiceDB.getCommunityUsersInRoom).toHaveBeenCalledWith(roomName)
        expect(mockVoiceDB.isActiveCommunityUser).toHaveBeenCalledTimes(2) // 1 for participants + 1 for moderators
      })
    })

    describe('and the room has a moderator with connection interrupted but within TTL', () => {
      beforeEach(() => {
        mockVoiceDB.isCommunityRoomActive.mockResolvedValue(true)
        const now = Date.now()
        const oneMinuteAgo = now - 1 * 60 * 1000 // 1 minute ago, within 5-minute TTL
        mockVoiceDB.getCommunityUsersInRoom.mockResolvedValue([
          {
            address: validModeratorAddress,
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.ConnectionInterrupted,
            joinedAt: now - 10 * 60 * 1000, // Joined 10 minutes ago
            statusUpdatedAt: oneMinuteAgo // Connection interrupted 1 minute ago, within TTL
          }
        ])
        // Moderator is ConnectionInterrupted but within TTL, should be considered active
        mockVoiceDB.isActiveCommunityUser.mockReturnValue(true)
      })

      it('should return active status and count the moderator as active participant', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: true,
          participantCount: 1, // Should count the ConnectionInterrupted moderator within TTL
          moderatorCount: 1 // Should count the ConnectionInterrupted moderator within TTL
        })

        expect(mockVoiceDB.isCommunityRoomActive).toHaveBeenCalledWith(roomName)
        expect(mockVoiceDB.getCommunityUsersInRoom).toHaveBeenCalledWith(roomName)
        expect(mockVoiceDB.isActiveCommunityUser).toHaveBeenCalledTimes(2) // 1 for participants + 1 for moderators
      })
    })

    describe('and the room has a moderator who has not connected and is beyond TTL', () => {
      beforeEach(() => {
        mockVoiceDB.isCommunityRoomActive.mockResolvedValue(true)
        const now = Date.now()
        const sixMinutesAgo = now - 6 * 60 * 1000 // 6 minutes ago, beyond 5-minute TTL
        mockVoiceDB.getCommunityUsersInRoom.mockResolvedValue([
          {
            address: validModeratorAddress,
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.NotConnected,
            joinedAt: sixMinutesAgo, // Joined 6 minutes ago, beyond TTL
            statusUpdatedAt: sixMinutesAgo
          }
        ])
        // Moderator is NotConnected and beyond TTL, should NOT be considered active
        mockVoiceDB.isActiveCommunityUser.mockReturnValue(false)
      })

      it('should NOT count the expired moderator as active participant', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(validCommunityId)

        expect(result).toEqual({
          active: false, // No active moderators
          participantCount: 0, // Should NOT count the expired moderator
          moderatorCount: 0 // Should NOT count the expired moderator
        })

        expect(mockVoiceDB.isCommunityRoomActive).toHaveBeenCalledWith(roomName)
        expect(mockVoiceDB.getCommunityUsersInRoom).toHaveBeenCalledWith(roomName)
        expect(mockVoiceDB.isActiveCommunityUser).toHaveBeenCalledTimes(2) // 1 for participants + 1 for moderators
      })
    })

    describe('when database query fails', () => {
      const error = new Error('Database error')

      beforeEach(() => {
        mockVoiceDB.isCommunityRoomActive.mockRejectedValue(error)
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

  describe('when requesting to speak in community voice chat', () => {
    it('should call livekit updateParticipantMetadata with correct parameters', async () => {
      await voiceComponent.requestToSpeakInCommunity(validCommunityId, validUserAddress)

      expect(mockLivekit.updateParticipantMetadata).toHaveBeenCalledWith(
        getCommunityVoiceChatRoomName(validCommunityId),
        validUserAddress,
        { isRequestingToSpeak: true }
      )
    })

    it('should log success message', async () => {
      await voiceComponent.requestToSpeakInCommunity(validCommunityId, validUserAddress)

      const mockLogger = mockLogs.getLogger('voice')
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Successfully updated metadata for user ${validUserAddress} in community ${validCommunityId}`
      )
    })
  })

  describe('when promoting a user to speaker in community voice chat', () => {
    it('should call livekit updateParticipantPermissions and updateParticipantMetadata', async () => {
      await voiceComponent.promoteSpeakerInCommunity(validCommunityId, validUserAddress)

      expect(mockLivekit.updateParticipantPermissions).toHaveBeenCalledWith(
        getCommunityVoiceChatRoomName(validCommunityId),
        validUserAddress,
        {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true
        }
      )

      expect(mockLivekit.updateParticipantMetadata).toHaveBeenCalledWith(
        getCommunityVoiceChatRoomName(validCommunityId),
        validUserAddress,
        { isRequestingToSpeak: false, isSpeaker: true }
      )
    })

    it('should log success message', async () => {
      await voiceComponent.promoteSpeakerInCommunity(validCommunityId, validUserAddress)

      const mockLogger = mockLogs.getLogger('voice')
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Successfully promoted user ${validUserAddress} to speaker in community ${validCommunityId}`
      )
    })
  })

  describe('when demoting a speaker to listener in community voice chat', () => {
    it('should call livekit updateParticipantPermissions and updateParticipantMetadata', async () => {
      await voiceComponent.demoteSpeakerInCommunity(validCommunityId, validUserAddress)

      expect(mockLivekit.updateParticipantPermissions).toHaveBeenCalledWith(
        getCommunityVoiceChatRoomName(validCommunityId),
        validUserAddress,
        {
          canPublish: false,
          canSubscribe: true,
          canPublishData: true
        }
      )

      expect(mockLivekit.updateParticipantMetadata).toHaveBeenCalledWith(
        getCommunityVoiceChatRoomName(validCommunityId),
        validUserAddress,
        { isRequestingToSpeak: false, isSpeaker: false }
      )
    })

    it('should log success message', async () => {
      await voiceComponent.demoteSpeakerInCommunity(validCommunityId, validUserAddress)

      const mockLogger = mockLogs.getLogger('voice')
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Successfully demoted user ${validUserAddress} to listener in community ${validCommunityId}`
      )
    })
  })

  describe('when kicking a player from community voice chat', () => {
    it('should call livekit removeParticipant with correct parameters', async () => {
      await voiceComponent.kickPlayerFromCommunity(validCommunityId, validUserAddress)

      expect(mockLivekit.removeParticipant).toHaveBeenCalledWith(
        getCommunityVoiceChatRoomName(validCommunityId),
        validUserAddress
      )
    })

    it('should log success message', async () => {
      await voiceComponent.kickPlayerFromCommunity(validCommunityId, validUserAddress)

      const mockLogger = mockLogs.getLogger('voice')
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Successfully kicked user ${validUserAddress} from community ${validCommunityId}`
      )
    })
  })
})
