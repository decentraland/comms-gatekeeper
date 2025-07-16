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
  let logs: jest.Mocked<ILoggerComponent>

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

    livekit = createLivekitMockedComponent({
      deleteRoom: deleteRoomMock,
      generateCredentials: generateCredentialsMock,
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

    voiceComponent = createVoiceComponent({
      voiceDB,
      livekit,
      logs,
      analytics
    })
  })

  describe('when handling that a participant joined a room', () => {
    const userAddress = '0x123'
    const roomName = 'voice-chat-private-test-room'  // Use correct private voice chat format

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
        const oldRoom = 'voice-chat-private-old-room'  // Use correct private voice chat format

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
    const roomName = 'voice-chat-private-test-room'  // Use correct private voice chat format

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
      
      expect(updateCommunityUserStatusMock).toHaveBeenCalledWith(
        userAddress, 
        roomName, 
        VoiceChatUserStatus.Connected
      )
    })
  })

  describe('when handling community participant left', () => {
    const userAddress = '0x123'
    const roomName = 'voice-chat-community-test-room'
    let updateCommunityUserStatusMock: jest.MockedFunction<IVoiceDBComponent['updateCommunityUserStatus']>
    let getCommunityUsersInRoomMock: jest.MockedFunction<IVoiceDBComponent['getCommunityUsersInRoom']>
    let deleteCommunityVoiceChatMock: jest.MockedFunction<IVoiceDBComponent['deleteCommunityVoiceChat']>
    let shouldDestroyCommunityRoomMock: jest.MockedFunction<IVoiceDBComponent['shouldDestroyCommunityRoom']>

    beforeEach(() => {
      updateCommunityUserStatusMock = jest.fn()
      getCommunityUsersInRoomMock = jest.fn()
      deleteCommunityVoiceChatMock = jest.fn()
      shouldDestroyCommunityRoomMock = jest.fn()
      voiceDB.updateCommunityUserStatus = updateCommunityUserStatusMock
      voiceDB.getCommunityUsersInRoom = getCommunityUsersInRoomMock
      voiceDB.deleteCommunityVoiceChat = deleteCommunityVoiceChatMock
      voiceDB.shouldDestroyCommunityRoom = shouldDestroyCommunityRoomMock
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
      it('should delete the community voice chat and resolve', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, DisconnectReason.ROOM_DELETED)

        expect(deleteCommunityVoiceChatMock).toHaveBeenCalledWith(roomName)
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
        expect(shouldDestroyCommunityRoomMock).not.toHaveBeenCalled()
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
        shouldDestroyCommunityRoomMock.mockResolvedValue(false)
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
        shouldDestroyCommunityRoomMock.mockResolvedValue(true)
      })

      it('should destroy the community room', async () => {
        await voiceComponent.handleParticipantLeft(userAddress, roomName, DisconnectReason.CLIENT_INITIATED)
        
        expect(updateCommunityUserStatusMock).toHaveBeenCalledWith(
          userAddress, 
          roomName, 
          VoiceChatUserStatus.Disconnected
        )
        expect(getCommunityUsersInRoomMock).toHaveBeenCalledWith(roomName)
        expect(deleteCommunityVoiceChatMock).toHaveBeenCalledWith(roomName)
        expect(deleteRoomMock).toHaveBeenCalledWith(roomName)
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
        await expect(voiceComponent.getCommunityVoiceChatCredentialsForModerator(communityId, userAddress)).rejects.toThrow(error)
      })
    })

    describe('and generating credentials succeeds', () => {
      const mockCredentials = { token: 'moderator-token', url: 'wss://voice.livekit.cloud' }

      beforeEach(() => {
        generateCredentialsMock.mockResolvedValue(mockCredentials)
        joinUserToCommunityRoomMock.mockResolvedValue(undefined)
      })

      it('should generate credentials for moderator, join to room and return connection URL', async () => {
        const result = await voiceComponent.getCommunityVoiceChatCredentialsForModerator(communityId, userAddress)

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
            role: 'moderator'
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
        await expect(voiceComponent.getCommunityVoiceChatCredentialsForMember(communityId, userAddress)).rejects.toThrow(error)
      })
    })

    describe('and generating credentials succeeds', () => {
      const mockCredentials = { token: 'member-token', url: 'wss://voice.livekit.cloud' }

      beforeEach(() => {
        generateCredentialsMock.mockResolvedValue(mockCredentials)
        joinUserToCommunityRoomMock.mockResolvedValue(undefined)
      })

      it('should generate credentials for member, join to room and return connection URL', async () => {
        const result = await voiceComponent.getCommunityVoiceChatCredentialsForMember(communityId, userAddress)

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
            role: 'member'
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

    beforeEach(() => {
      deleteExpiredCommunityVoiceChatsMock = jest.fn()
      voiceDB.deleteExpiredCommunityVoiceChats = deleteExpiredCommunityVoiceChatsMock
    })

    it('should delete expired community voice chats and destroy their rooms', async () => {
      const expiredRoomNames = ['voice-chat-community-room1', 'voice-chat-community-room2']
      deleteExpiredCommunityVoiceChatsMock.mockResolvedValue(expiredRoomNames)

      await voiceComponent.expireCommunityVoiceChats()

      expect(deleteExpiredCommunityVoiceChatsMock).toHaveBeenCalled()
      expect(deleteRoomMock).toHaveBeenCalledTimes(2)
      expect(deleteRoomMock).toHaveBeenCalledWith(expiredRoomNames[0])
      expect(deleteRoomMock).toHaveBeenCalledWith(expiredRoomNames[1])
    })

    it('should handle empty expired rooms list', async () => {
      deleteExpiredCommunityVoiceChatsMock.mockResolvedValue([])

      await voiceComponent.expireCommunityVoiceChats()

      expect(deleteExpiredCommunityVoiceChatsMock).toHaveBeenCalled()
      expect(deleteRoomMock).not.toHaveBeenCalled()
    })
  })
})
