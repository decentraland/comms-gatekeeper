import { DisconnectReason } from '@livekit/protocol'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { IVoiceDBComponent } from '../../src/adapters/db/types'
import { IVoiceComponent } from '../../src/logic/voice/types'
import { createVoiceComponent } from '../../src/logic/voice/voice'
import { ILivekitComponent, LivekitCredentials } from '../../src/types/livekit.type'
import { createVoiceDBMockedComponent } from '../mocks/voice-db-mock'
import { createLivekitMockedComponent } from '../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createAnalyticsMockedComponent } from '../mocks/analytics-mocks'
import { VoiceChatUserStatus } from '../../src/adapters/db/types'
import { CommunityRole } from '../../src/types/social.type'
import { CommunityVoiceChatAction } from '../../src/types/community-voice'
import { IPublisherComponent } from '@dcl/sns-component'
import { createPublisherMockedComponent } from '../mocks/publisher-mock'

describe('Voice Logic Component', () => {
  let voiceComponent: IVoiceComponent
  let voiceDB: jest.Mocked<IVoiceDBComponent>
  let livekit: jest.Mocked<ILivekitComponent>
  let deleteRoomMock: jest.MockedFunction<ILivekitComponent['deleteRoom']>
  let generateCredentialsMock: jest.MockedFunction<ILivekitComponent['generateCredentials']>
  let getRoomUserIsInMock: jest.MockedFunction<IVoiceDBComponent['getRoomUserIsIn']>
  let joinUserToRoomMock: jest.MockedFunction<IVoiceDBComponent['joinUserToRoom']>
  let removeUserFromRoomMock: jest.MockedFunction<IVoiceDBComponent['updateUserStatusAsDisconnected']>
  let disconnectUserFromRoomMock: jest.MockedFunction<IVoiceDBComponent['updateUserStatusAsConnectionInterrupted']>
  let isPrivateRoomActiveMock: jest.MockedFunction<IVoiceDBComponent['isPrivateRoomActive']>
  let createVoiceChatRoomMock: jest.MockedFunction<IVoiceDBComponent['createVoiceChatRoom']>
  let deletePrivateVoiceChatMock: jest.MockedFunction<IVoiceDBComponent['deletePrivateVoiceChat']>
  let deletePrivateVoiceChatUserIsOrWasInMock: jest.MockedFunction<
    IVoiceDBComponent['deletePrivateVoiceChatUserIsOrWasIn']
  >
  let deleteExpiredPrivateVoiceChatsMock: jest.MockedFunction<IVoiceDBComponent['deleteExpiredPrivateVoiceChats']>
  let isCommunityRoomActiveMock: jest.MockedFunction<IVoiceDBComponent['isCommunityRoomActive']>
  let isActiveCommunityUserMock: jest.MockedFunction<IVoiceDBComponent['isActiveCommunityUser']>
  let updateParticipantMetadataMock: jest.MockedFunction<ILivekitComponent['updateParticipantMetadata']>
  let logs: jest.Mocked<ILoggerComponent>
  let publisher: jest.Mocked<IPublisherComponent>

  beforeEach(() => {
    jest.resetAllMocks()

    deleteRoomMock = jest.fn()
    generateCredentialsMock = jest.fn()
    getRoomUserIsInMock = jest.fn()
    joinUserToRoomMock = jest.fn()
    removeUserFromRoomMock = jest.fn()
    disconnectUserFromRoomMock = jest.fn()
    isPrivateRoomActiveMock = jest.fn()
    createVoiceChatRoomMock = jest.fn()
    deletePrivateVoiceChatMock = jest.fn()
    deletePrivateVoiceChatUserIsOrWasInMock = jest.fn()
    deleteExpiredPrivateVoiceChatsMock = jest.fn()
    isCommunityRoomActiveMock = jest.fn()
    isActiveCommunityUserMock = jest.fn()
    updateParticipantMetadataMock = jest.fn()

    livekit = createLivekitMockedComponent({
      deleteRoom: deleteRoomMock,
      generateCredentials: generateCredentialsMock,
      updateParticipantMetadata: updateParticipantMetadataMock,
      buildConnectionUrl: jest
        .fn()
        .mockImplementation((url: string, token: string) => `livekit:${url}?access_token=${token}`)
    })

    voiceDB = createVoiceDBMockedComponent({
      getRoomUserIsIn: getRoomUserIsInMock,
      joinUserToRoom: joinUserToRoomMock,
      updateUserStatusAsDisconnected: removeUserFromRoomMock,
      updateUserStatusAsConnectionInterrupted: disconnectUserFromRoomMock,
      isPrivateRoomActive: isPrivateRoomActiveMock,
      createVoiceChatRoom: createVoiceChatRoomMock,
      deletePrivateVoiceChat: deletePrivateVoiceChatMock,
      deletePrivateVoiceChatUserIsOrWasIn: deletePrivateVoiceChatUserIsOrWasInMock,
      deleteExpiredPrivateVoiceChats: deleteExpiredPrivateVoiceChatsMock,
      isCommunityRoomActive: isCommunityRoomActiveMock,
      isActiveCommunityUser: isActiveCommunityUserMock
    })

    logs = createLoggerMockedComponent()

    const analytics = createAnalyticsMockedComponent()
    publisher = createPublisherMockedComponent()

    voiceComponent = createVoiceComponent({
      voiceDB,
      livekit,
      logs,
      analytics,
      publisher
    })
  })

  describe('when handling that a participant joined a room', () => {
    const userAddress = '0x123'
    const roomName = 'voice-chat-private-test-room' // Use correct private voice chat format

    describe('and the room is inactive', () => {
      beforeEach(() => {
        isPrivateRoomActiveMock.mockResolvedValue(false)
      })

      it('should delete the room and resolve', async () => {
        await expect(voiceComponent.handleParticipantJoined(userAddress, roomName)).resolves.toBeUndefined()
        expect(deleteRoomMock).toHaveBeenCalledWith(roomName)
      })
    })

    describe('and the room is active', () => {
      beforeEach(() => {
        isPrivateRoomActiveMock.mockResolvedValue(true)
      })

      describe('and the user is in the same room', () => {
        beforeEach(() => {
          joinUserToRoomMock.mockResolvedValue({ oldRoom: roomName })
        })

        it('should join the user to the room without deleting any room', async () => {
          await voiceComponent.handleParticipantJoined(userAddress, roomName)

          expect(joinUserToRoomMock).toHaveBeenCalledWith(userAddress, roomName)
          expect(deleteRoomMock).not.toHaveBeenCalled()
        })
      })

      describe('and the user is in a different room', () => {
        const oldRoom = 'voice-chat-private-old-room' // Use correct private voice chat format

        beforeEach(() => {
          joinUserToRoomMock.mockResolvedValue({ oldRoom })
        })

        it('should join the user to the new room and delete the old room', async () => {
          await voiceComponent.handleParticipantJoined(userAddress, roomName)

          expect(joinUserToRoomMock).toHaveBeenCalledWith(userAddress, roomName)
          expect(deleteRoomMock).toHaveBeenCalledWith(oldRoom)
        })
      })
    })
  })

  describe('when handling that a participant left a room', () => {
    const userAddress = '0x123'
    const roomName = 'voice-chat-private-test-room' // Use correct private voice chat format

    describe('and the participant left because of a duplicate identity', () => {
      const disconnectReason = DisconnectReason.DUPLICATE_IDENTITY

      it('should do nothing and resolve', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, disconnectReason)

        expect(deleteRoomMock).not.toHaveBeenCalled()
        expect(removeUserFromRoomMock).not.toHaveBeenCalled()
        expect(disconnectUserFromRoomMock).not.toHaveBeenCalled()
        expect(deletePrivateVoiceChatMock).not.toHaveBeenCalled()
      })
    })

    describe('and the participant left willingly', () => {
      const disconnectReason = DisconnectReason.CLIENT_INITIATED

      it('should delete the room, remove the user from the room and resolve', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, disconnectReason)

        expect(deleteRoomMock).toHaveBeenCalledWith(roomName)
        expect(removeUserFromRoomMock).toHaveBeenCalledWith(userAddress, roomName)
        expect(disconnectUserFromRoomMock).not.toHaveBeenCalled()
        expect(deletePrivateVoiceChatMock).not.toHaveBeenCalled()
      })
    })

    describe('and the room was deleted', () => {
      const disconnectReason = DisconnectReason.ROOM_DELETED

      it('should delete the private voice chat and resolve', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, disconnectReason)

        expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(roomName)
        expect(disconnectUserFromRoomMock).not.toHaveBeenCalled()
        expect(deleteRoomMock).not.toHaveBeenCalled()
        expect(removeUserFromRoomMock).not.toHaveBeenCalled()
      })
    })

    describe('and the participant left due to another reason', () => {
      const disconnectReason = DisconnectReason.MIGRATION

      it('should only disconnect the user from the room', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, disconnectReason)

        expect(disconnectUserFromRoomMock).toHaveBeenCalledWith(userAddress, roomName)
        expect(deleteRoomMock).not.toHaveBeenCalled()
        expect(removeUserFromRoomMock).not.toHaveBeenCalled()
        expect(deletePrivateVoiceChatMock).not.toHaveBeenCalled()
      })
    })
  })

  describe('when checking if a user is in a voice chat', () => {
    const userAddress = '0x123'

    describe('and the user is in a room', () => {
      beforeEach(() => {
        getRoomUserIsInMock.mockResolvedValue('test-room')
      })

      it('should return true', async () => {
        const result = await voiceComponent.isUserInVoiceChat(userAddress)

        expect(result).toBe(true)
        expect(getRoomUserIsInMock).toHaveBeenCalledWith(userAddress)
      })
    })

    describe('and the user is not in a room', () => {
      beforeEach(() => {
        getRoomUserIsInMock.mockResolvedValue(null)
      })

      it('should return false', async () => {
        const result = await voiceComponent.isUserInVoiceChat(userAddress)

        expect(result).toBe(false)
        expect(getRoomUserIsInMock).toHaveBeenCalledWith(userAddress)
      })
    })
  })

  describe('when getting private voice chat room credentials', () => {
    const roomId = 'room-123'
    const userAddresses = ['0x111', '0x222']
    const expectedRoomName = 'voice-chat-private-room-123'
    let mockCredentials: LivekitCredentials[]

    describe('and getting the credentials fails', () => {
      const error = new Error('Livekit error')

      beforeEach(() => {
        generateCredentialsMock.mockRejectedValue(error)
      })

      it('should reject with the error', async () => {
        await expect(voiceComponent.getPrivateVoiceChatRoomCredentials(roomId, userAddresses)).rejects.toThrow(error)
      })
    })

    describe('and getting the credentials succeeds', () => {
      beforeEach(() => {
        mockCredentials = [
          { token: 'token1', url: 'url1' },
          { token: 'token2', url: 'url2' }
        ]

        generateCredentialsMock.mockResolvedValueOnce(mockCredentials[0]).mockResolvedValueOnce(mockCredentials[1])
      })

      it('should generate credentials for all users, create the room and resolve with the credentials', async () => {
        const result = await voiceComponent.getPrivateVoiceChatRoomCredentials(roomId, userAddresses)

        expect(generateCredentialsMock).toHaveBeenCalledTimes(2)
        expect(generateCredentialsMock).toHaveBeenNthCalledWith(
          1,
          userAddresses[0],
          expectedRoomName,
          {
            cast: [],
            canPublish: true,
            canSubscribe: true,
            canUpdateOwnMetadata: false
          },
          false
        )
        expect(generateCredentialsMock).toHaveBeenNthCalledWith(
          2,
          userAddresses[1],
          expectedRoomName,
          {
            cast: [],
            canPublish: true,
            canSubscribe: true,
            canUpdateOwnMetadata: false
          },
          false
        )
        expect(createVoiceChatRoomMock).toHaveBeenCalledWith(expectedRoomName, userAddresses)
        expect(result).toEqual({
          [userAddresses[0]]: {
            connectionUrl: `livekit:${mockCredentials[0].url}?access_token=${mockCredentials[0].token}`
          },
          [userAddresses[1]]: {
            connectionUrl: `livekit:${mockCredentials[1].url}?access_token=${mockCredentials[1].token}`
          }
        })
      })
    })
  })

  describe('when ending a private voice chat', () => {
    const roomId = 'room-123'
    const userAddress = '0x123'
    const expectedRoomName = 'voice-chat-private-room-123'
    const usersInRoom = ['0x111', '0x222']

    describe('and the operation succeeds', () => {
      beforeEach(() => {
        deletePrivateVoiceChatUserIsOrWasInMock.mockResolvedValue(usersInRoom)
        deleteRoomMock.mockResolvedValue(undefined)
      })

      it('should delete the private voice chat, delete the room and return the users that were in the room', async () => {
        const result = await voiceComponent.endPrivateVoiceChat(roomId, userAddress)

        expect(deletePrivateVoiceChatUserIsOrWasInMock).toHaveBeenCalledWith(expectedRoomName, userAddress)
        expect(deleteRoomMock).toHaveBeenCalledWith(expectedRoomName)
        expect(result).toEqual(usersInRoom)
      })
    })
  })

  describe('when expiring private voice chats', () => {
    let expiredRoomNames: string[]

    beforeEach(() => {
      expiredRoomNames = ['room-123', 'room-456']
      deleteExpiredPrivateVoiceChatsMock.mockResolvedValue(expiredRoomNames)
      deleteRoomMock.mockResolvedValue(undefined)
    })

    it('should delete the expired private voice chats and delete the rooms from LiveKit', async () => {
      await voiceComponent.expirePrivateVoiceChats()

      expect(deleteRoomMock).toHaveBeenCalledTimes(expiredRoomNames.length)
      expect(deleteRoomMock).toHaveBeenCalledWith(expiredRoomNames[0])
      expect(deleteRoomMock).toHaveBeenCalledWith(expiredRoomNames[1])
    })
  })

  describe('when handling community participant joined', () => {
    const userAddress = '0x123'
    const roomName = 'voice-chat-community-test-room'
    let updateCommunityUserStatusMock: jest.MockedFunction<IVoiceDBComponent['updateCommunityUserStatus']>

    beforeEach(() => {
      updateCommunityUserStatusMock = jest.fn()
      voiceDB.updateCommunityUserStatus = updateCommunityUserStatusMock
    })

    it('should update user status to connected', async () => {
      await voiceComponent.handleParticipantJoined(userAddress, roomName)

      expect(updateCommunityUserStatusMock).toHaveBeenCalledWith(userAddress, roomName, VoiceChatUserStatus.Connected)
    })
  })

  describe('when handling community participant left', () => {
    const userAddress = '0x123'
    const roomName = 'voice-chat-community-test-room'
    let updateCommunityUserStatusMock: jest.MockedFunction<IVoiceDBComponent['updateCommunityUserStatus']>
    let getCommunityUsersInRoomMock: jest.MockedFunction<IVoiceDBComponent['getCommunityUsersInRoom']>
    let deleteCommunityVoiceChatMock: jest.MockedFunction<IVoiceDBComponent['deleteCommunityVoiceChat']>
    let getCommunityVoiceChatParticipantCountMock: jest.MockedFunction<
      IVoiceDBComponent['getCommunityVoiceChatParticipantCount']
    >
    let publishMessageMock: jest.MockedFunction<IPublisherComponent['publishMessage']>

    beforeEach(() => {
      updateCommunityUserStatusMock = jest.fn()
      getCommunityUsersInRoomMock = jest.fn()
      deleteCommunityVoiceChatMock = jest.fn()
      getCommunityVoiceChatParticipantCountMock = jest.fn()
      publishMessageMock = jest.fn()

      voiceDB.updateCommunityUserStatus = updateCommunityUserStatusMock
      voiceDB.getCommunityUsersInRoom = getCommunityUsersInRoomMock
      voiceDB.deleteCommunityVoiceChat = deleteCommunityVoiceChatMock
      voiceDB.getCommunityVoiceChatParticipantCount = getCommunityVoiceChatParticipantCountMock
      publisher.publishMessage = publishMessageMock
    })

    describe('when participant left because of a duplicate identity', () => {
      it('should do nothing and resolve', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, DisconnectReason.DUPLICATE_IDENTITY)

        expect(updateCommunityUserStatusMock).not.toHaveBeenCalled()
        expect(getCommunityUsersInRoomMock).not.toHaveBeenCalled()
        expect(deleteCommunityVoiceChatMock).not.toHaveBeenCalled()
        expect(deleteRoomMock).not.toHaveBeenCalled()
      })
    })

    describe('when room was deleted', () => {
      beforeEach(() => {
        getCommunityVoiceChatParticipantCountMock.mockResolvedValue(5)
        publishMessageMock.mockResolvedValue(undefined)
      })

      it('should get participant count, delete the community voice chat, and publish event', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, DisconnectReason.ROOM_DELETED)

        expect(getCommunityVoiceChatParticipantCountMock).toHaveBeenCalledWith(roomName)
        expect(deleteCommunityVoiceChatMock).toHaveBeenCalledWith(roomName)
        expect(publishMessageMock).toHaveBeenCalledTimes(1)
        expect(publishMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'streaming',
            subType: 'community-streaming-ended',
            metadata: expect.objectContaining({
              communityId: 'test-room',
              totalParticipants: 5
            })
          })
        )
        expect(updateCommunityUserStatusMock).not.toHaveBeenCalled()
        expect(getCommunityUsersInRoomMock).not.toHaveBeenCalled()
        expect(deleteRoomMock).not.toHaveBeenCalled()
      })
    })

    describe('when participant left due to connection interruption', () => {
      it('should update user status as connection interrupted', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, DisconnectReason.MIGRATION)

        expect(updateCommunityUserStatusMock).toHaveBeenCalledWith(
          userAddress,
          roomName,
          VoiceChatUserStatus.ConnectionInterrupted
        )
        expect(getCommunityUsersInRoomMock).not.toHaveBeenCalled()
        expect(deleteCommunityVoiceChatMock).not.toHaveBeenCalled()
        expect(deleteRoomMock).not.toHaveBeenCalled()
      })
    })

    describe('when user leaving is not a moderator', () => {
      beforeEach(() => {
        getCommunityUsersInRoomMock.mockResolvedValue([
          {
            address: userAddress,
            roomName,
            isModerator: false,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          }
        ])
      })

      it('should update user status as disconnected without destroying room', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, DisconnectReason.CLIENT_INITIATED)

        expect(updateCommunityUserStatusMock).toHaveBeenCalledWith(
          userAddress,
          roomName,
          VoiceChatUserStatus.Disconnected
        )

        expect(deleteCommunityVoiceChatMock).not.toHaveBeenCalled()
        expect(deleteRoomMock).not.toHaveBeenCalled()
      })
    })

    describe('when moderator leaves but other moderators remain', () => {
      beforeEach(() => {
        getCommunityUsersInRoomMock.mockResolvedValue([
          {
            address: userAddress,
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          },
          {
            address: '0x456',
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          }
        ])

        // Mock isActiveCommunityUser to return true for both users (they're both connected)
        isActiveCommunityUserMock.mockReturnValue(true)
      })

      it('should update user status without destroying room', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, DisconnectReason.CLIENT_INITIATED)

        expect(updateCommunityUserStatusMock).toHaveBeenCalledWith(
          userAddress,
          roomName,
          VoiceChatUserStatus.Disconnected
        )
        expect(getCommunityUsersInRoomMock).toHaveBeenCalledWith(roomName)
        expect(deleteCommunityVoiceChatMock).not.toHaveBeenCalled()
        expect(deleteRoomMock).not.toHaveBeenCalled()
      })
    })

    describe('when last moderator leaves', () => {
      beforeEach(() => {
        getCommunityUsersInRoomMock.mockResolvedValue([
          {
            address: userAddress,
            roomName,
            isModerator: true,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          },
          {
            address: '0x456',
            roomName,
            isModerator: false,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          }
        ])
        getCommunityVoiceChatParticipantCountMock.mockResolvedValue(2)
        publishMessageMock.mockResolvedValue(undefined)
      })

      it('should get participant count, destroy the community room, and publish event', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, DisconnectReason.CLIENT_INITIATED)

        expect(updateCommunityUserStatusMock).toHaveBeenCalledWith(
          userAddress,
          roomName,
          VoiceChatUserStatus.Disconnected
        )
        expect(getCommunityUsersInRoomMock).toHaveBeenCalledWith(roomName)
        expect(getCommunityVoiceChatParticipantCountMock).toHaveBeenCalledWith(roomName)
        expect(deleteCommunityVoiceChatMock).toHaveBeenCalledWith(roomName)
        expect(deleteRoomMock).toHaveBeenCalledWith(roomName)
        expect(publishMessageMock).toHaveBeenCalledTimes(1)
        expect(publishMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'streaming',
            subType: 'community-streaming-ended',
            metadata: expect.objectContaining({
              communityId: 'test-room',
              totalParticipants: 2
            })
          })
        )
      })
    })
  })

  describe('when getting community voice chat credentials for moderator', () => {
    const communityId = 'test-community-123'
    const userAddress = '0x123'
    const expectedRoomName = 'voice-chat-community-test-community-123'
    let joinUserToCommunityRoomMock: jest.MockedFunction<IVoiceDBComponent['joinUserToCommunityRoom']>

    beforeEach(() => {
      joinUserToCommunityRoomMock = jest.fn()
      voiceDB.joinUserToCommunityRoom = joinUserToCommunityRoomMock
    })

    describe('and generating credentials fails', () => {
      const error = new Error('Livekit error')

      beforeEach(() => {
        generateCredentialsMock.mockRejectedValue(error)
      })

      it('should reject with the error', async () => {
        await expect(
          voiceComponent.getCommunityVoiceChatCredentialsWithRole(
            communityId,
            userAddress,
            CommunityRole.Moderator,
            undefined,
            CommunityVoiceChatAction.CREATE
          )
        ).rejects.toThrow(error)
      })
    })

    describe('and generating credentials succeeds', () => {
      const mockCredentials = { token: 'moderator-token', url: 'wss://voice.livekit.cloud' }

      beforeEach(() => {
        generateCredentialsMock.mockResolvedValue(mockCredentials)
        joinUserToCommunityRoomMock.mockResolvedValue(undefined)
      })

      it('should generate credentials for moderator, join to room and return connection URL', async () => {
        const result = await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          communityId,
          userAddress,
          CommunityRole.Moderator,
          undefined,
          CommunityVoiceChatAction.CREATE
        )

        expect(generateCredentialsMock).toHaveBeenCalledWith(
          userAddress,
          expectedRoomName,
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
        expect(joinUserToCommunityRoomMock).toHaveBeenCalledWith(userAddress, expectedRoomName, true)
        expect(result).toEqual({
          connectionUrl: `livekit:${mockCredentials.url}?access_token=${mockCredentials.token}`
        })
      })
    })
  })

  describe('when getting community voice chat credentials for member', () => {
    const communityId = 'test-community-123'
    const userAddress = '0x123'
    const expectedRoomName = 'voice-chat-community-test-community-123'
    let joinUserToCommunityRoomMock: jest.MockedFunction<IVoiceDBComponent['joinUserToCommunityRoom']>

    beforeEach(() => {
      joinUserToCommunityRoomMock = jest.fn()
      voiceDB.joinUserToCommunityRoom = joinUserToCommunityRoomMock
    })

    describe('and generating credentials fails', () => {
      const error = new Error('Livekit error')

      beforeEach(() => {
        generateCredentialsMock.mockRejectedValue(error)
      })

      it('should reject with the error', async () => {
        await expect(
          voiceComponent.getCommunityVoiceChatCredentialsWithRole(
            communityId,
            userAddress,
            CommunityRole.Member,
            undefined
          )
        ).rejects.toThrow(error)
      })
    })

    describe('and generating credentials succeeds', () => {
      const mockCredentials = { token: 'member-token', url: 'wss://voice.livekit.cloud' }

      beforeEach(() => {
        generateCredentialsMock.mockResolvedValue(mockCredentials)
        joinUserToCommunityRoomMock.mockResolvedValue(undefined)
      })

      it('should generate credentials for member, join to room and return connection URL', async () => {
        const result = await voiceComponent.getCommunityVoiceChatCredentialsWithRole(
          communityId,
          userAddress,
          CommunityRole.Member,
          undefined
        )

        expect(generateCredentialsMock).toHaveBeenCalledWith(
          userAddress,
          expectedRoomName,
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
        expect(joinUserToCommunityRoomMock).toHaveBeenCalledWith(userAddress, expectedRoomName, false)
        expect(result).toEqual({
          connectionUrl: `livekit:${mockCredentials.url}?access_token=${mockCredentials.token}`
        })
      })
    })
  })

  describe('when getting community voice chat status', () => {
    const communityId = 'test-community-123'
    const expectedRoomName = 'voice-chat-community-test-community-123'
    let getCommunityUsersInRoomMock: jest.MockedFunction<IVoiceDBComponent['getCommunityUsersInRoom']>

    beforeEach(() => {
      getCommunityUsersInRoomMock = jest.fn()
      voiceDB.getCommunityUsersInRoom = getCommunityUsersInRoomMock
    })

    describe('when room is not active', () => {
      beforeEach(() => {
        isCommunityRoomActiveMock.mockResolvedValue(false)
      })

      it('should return inactive status with zero counts', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(communityId)

        expect(result).toEqual({
          active: false,
          participantCount: 0,
          moderatorCount: 0
        })

        expect(isCommunityRoomActiveMock).toHaveBeenCalledWith(expectedRoomName)
      })
    })

    describe('when room is active', () => {
      beforeEach(() => {
        isCommunityRoomActiveMock.mockResolvedValue(true)
        getCommunityUsersInRoomMock.mockResolvedValue([
          {
            address: '0x456',
            roomName: expectedRoomName,
            isModerator: true,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          },
          {
            address: '0x123',
            roomName: expectedRoomName,
            isModerator: false,
            status: VoiceChatUserStatus.Connected,
            joinedAt: Date.now(),
            statusUpdatedAt: Date.now()
          }
        ])
        // Both users are connected, so they should be considered active
        isActiveCommunityUserMock.mockReturnValue(true)
      })

      it('should return active status with correct counts', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(communityId)

        expect(result).toEqual({
          active: true,
          participantCount: 2,
          moderatorCount: 1
        })
      })
    })

    describe('when database query fails', () => {
      const error = new Error('Database error')

      beforeEach(() => {
        isCommunityRoomActiveMock.mockRejectedValue(error)
      })

      it('should return inactive status', async () => {
        const result = await voiceComponent.getCommunityVoiceChatStatus(communityId)

        expect(result).toEqual({
          active: false,
          participantCount: 0,
          moderatorCount: 0
        })
      })
    })
  })

  describe('when expiring community voice chats', () => {
    let deleteExpiredCommunityVoiceChatsMock: jest.MockedFunction<IVoiceDBComponent['deleteExpiredCommunityVoiceChats']>
    let getAllActiveCommunityVoiceChatsMock: jest.MockedFunction<IVoiceDBComponent['getAllActiveCommunityVoiceChats']>
    let getBulkCommunityVoiceChatParticipantCountMock: jest.MockedFunction<
      IVoiceDBComponent['getBulkCommunityVoiceChatParticipantCount']
    >
    let publishMessageMock: jest.MockedFunction<IPublisherComponent['publishMessage']>

    beforeEach(() => {
      deleteExpiredCommunityVoiceChatsMock = jest.fn()
      getAllActiveCommunityVoiceChatsMock = jest.fn()
      getBulkCommunityVoiceChatParticipantCountMock = jest.fn()
      publishMessageMock = jest.fn()

      voiceDB.deleteExpiredCommunityVoiceChats = deleteExpiredCommunityVoiceChatsMock
      voiceDB.getAllActiveCommunityVoiceChats = getAllActiveCommunityVoiceChatsMock
      voiceDB.getBulkCommunityVoiceChatParticipantCount = getBulkCommunityVoiceChatParticipantCountMock
      publisher.publishMessage = publishMessageMock
    })

    it('should get participant counts, delete expired community voice chats, destroy their rooms, and publish events', async () => {
      const expiredRoomNames = ['voice-chat-community-room1', 'voice-chat-community-room2']
      const communityIds = ['room1', 'room2']
      const roomCounts = new Map<string, number>()
      roomCounts.set(expiredRoomNames[0], 3)
      roomCounts.set(expiredRoomNames[1], 5)

      getAllActiveCommunityVoiceChatsMock.mockResolvedValue(
        communityIds.map((id) => ({
          communityId: id,
          participantCount: 0,
          moderatorCount: 0
        }))
      )
      getBulkCommunityVoiceChatParticipantCountMock.mockResolvedValue(roomCounts)
      deleteExpiredCommunityVoiceChatsMock.mockResolvedValue(expiredRoomNames)

      await voiceComponent.expireCommunityVoiceChats()

      expect(getAllActiveCommunityVoiceChatsMock).toHaveBeenCalled()
      expect(getBulkCommunityVoiceChatParticipantCountMock).toHaveBeenCalledWith(communityIds)
      expect(deleteExpiredCommunityVoiceChatsMock).toHaveBeenCalled()
      expect(deleteRoomMock).toHaveBeenCalledTimes(2)
      expect(deleteRoomMock).toHaveBeenCalledWith(expiredRoomNames[0])
      expect(deleteRoomMock).toHaveBeenCalledWith(expiredRoomNames[1])
      expect(publishMessageMock).toHaveBeenCalledTimes(2)
      expect(publishMessageMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          type: 'streaming',
          subType: 'community-streaming-ended',
          metadata: expect.objectContaining({
            communityId: 'room1',
            totalParticipants: 3
          })
        })
      )
      expect(publishMessageMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          type: 'streaming',
          subType: 'community-streaming-ended',
          metadata: expect.objectContaining({
            communityId: 'room2',
            totalParticipants: 5
          })
        })
      )
    })

    it('should handle empty expired rooms list', async () => {
      getAllActiveCommunityVoiceChatsMock.mockResolvedValue([])
      getBulkCommunityVoiceChatParticipantCountMock.mockResolvedValue(new Map())
      deleteExpiredCommunityVoiceChatsMock.mockResolvedValue([])

      await voiceComponent.expireCommunityVoiceChats()

      expect(getAllActiveCommunityVoiceChatsMock).toHaveBeenCalled()
      expect(getBulkCommunityVoiceChatParticipantCountMock).toHaveBeenCalledWith([])
      expect(deleteExpiredCommunityVoiceChatsMock).toHaveBeenCalled()
      expect(deleteRoomMock).not.toHaveBeenCalled()
      expect(publishMessageMock).not.toHaveBeenCalled()
    })
  })

  describe('when ending community voice chat', () => {
    const communityId = 'test-community'
    const userAddress = '0x1234567890123456789012345678901234567890'
    const roomName = 'voice-chat-community-test-community'
    let deleteCommunityVoiceChatMock: jest.MockedFunction<IVoiceDBComponent['deleteCommunityVoiceChat']>
    let getCommunityVoiceChatParticipantCountMock: jest.MockedFunction<
      IVoiceDBComponent['getCommunityVoiceChatParticipantCount']
    >
    let publishMessageMock: jest.MockedFunction<IPublisherComponent['publishMessage']>

    beforeEach(() => {
      deleteCommunityVoiceChatMock = jest.fn()
      getCommunityVoiceChatParticipantCountMock = jest.fn()
      publishMessageMock = jest.fn()

      voiceDB.deleteCommunityVoiceChat = deleteCommunityVoiceChatMock
      voiceDB.getCommunityVoiceChatParticipantCount = getCommunityVoiceChatParticipantCountMock
      publisher.publishMessage = publishMessageMock
    })

    it('should get participant count, end community voice chat successfully, and publish event', async () => {
      deleteRoomMock.mockResolvedValue(undefined)
      deleteCommunityVoiceChatMock.mockResolvedValue(undefined)
      getCommunityVoiceChatParticipantCountMock.mockResolvedValue(4)
      publishMessageMock.mockResolvedValue(undefined)

      await voiceComponent.endCommunityVoiceChat(communityId, userAddress)

      expect(getCommunityVoiceChatParticipantCountMock).toHaveBeenCalledWith(roomName)
      expect(deleteRoomMock).toHaveBeenCalledWith(roomName)
      expect(deleteCommunityVoiceChatMock).toHaveBeenCalledWith(roomName)
      expect(publishMessageMock).toHaveBeenCalledTimes(1)
      expect(publishMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'streaming',
          subType: 'community-streaming-ended',
          metadata: expect.objectContaining({
            communityId: 'test-community',
            totalParticipants: 4
          })
        })
      )
    })

    it('should handle livekit deletion error and not clean database or publish', async () => {
      deleteRoomMock.mockRejectedValue(new Error('LiveKit deletion failed'))
      deleteCommunityVoiceChatMock.mockResolvedValue(undefined)
      getCommunityVoiceChatParticipantCountMock.mockResolvedValue(4)

      await expect(voiceComponent.endCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
        'LiveKit deletion failed'
      )

      expect(getCommunityVoiceChatParticipantCountMock).toHaveBeenCalledWith(roomName)
      expect(deleteRoomMock).toHaveBeenCalledWith(roomName)
      expect(deleteCommunityVoiceChatMock).not.toHaveBeenCalled()
      expect(publishMessageMock).not.toHaveBeenCalled()
    })

    it('should handle database deletion error', async () => {
      deleteRoomMock.mockResolvedValue(undefined)
      deleteCommunityVoiceChatMock.mockRejectedValue(new Error('Database deletion failed'))
      getCommunityVoiceChatParticipantCountMock.mockResolvedValue(4)

      await expect(voiceComponent.endCommunityVoiceChat(communityId, userAddress)).rejects.toThrow(
        'Database deletion failed'
      )

      expect(getCommunityVoiceChatParticipantCountMock).toHaveBeenCalledWith(roomName)
      expect(deleteRoomMock).toHaveBeenCalledWith(roomName)
      expect(deleteCommunityVoiceChatMock).toHaveBeenCalledWith(roomName)
      expect(publishMessageMock).not.toHaveBeenCalled()
    })
  })

  describe('when muting speaker in community voice chat', () => {
    const communityId = 'test-community'
    const userAddress = '0x1234567890123456789012345678901234567890'
    const roomName = 'voice-chat-community-test-community'

    describe('when muting a speaker', () => {
      beforeEach(() => {
        updateParticipantMetadataMock.mockResolvedValue(undefined)
      })

      it('should mute speaker successfully', async () => {
        await voiceComponent.muteSpeakerInCommunityVoiceChat(communityId, userAddress, true)

        expect(updateParticipantMetadataMock).toHaveBeenCalledWith(roomName, userAddress, {
          muted: true
        })
      })
    })

    describe('when unmuting a speaker', () => {
      beforeEach(() => {
        updateParticipantMetadataMock.mockResolvedValue(undefined)
      })

      it('should unmute speaker successfully', async () => {
        await voiceComponent.muteSpeakerInCommunityVoiceChat(communityId, userAddress, false)

        expect(updateParticipantMetadataMock).toHaveBeenCalledWith(roomName, userAddress, {
          muted: false
        })
      })
    })

    describe('when livekit update fails', () => {
      const error = new Error('LiveKit update failed')

      beforeEach(() => {
        updateParticipantMetadataMock.mockRejectedValue(error)
      })

      it('should throw the error', async () => {
        await expect(voiceComponent.muteSpeakerInCommunityVoiceChat(communityId, userAddress, true)).rejects.toThrow(
          'LiveKit update failed'
        )

        expect(updateParticipantMetadataMock).toHaveBeenCalledWith(roomName, userAddress, {
          muted: true
        })
      })
    })
  })
})
