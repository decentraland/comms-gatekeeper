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

describe('voice logic component', () => {
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
  let deleteExpiredPrivateVoiceChatsMock: jest.MockedFunction<IVoiceDBComponent['deleteExpiredPrivateVoiceChats']>
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
    deleteExpiredPrivateVoiceChatsMock = jest.fn()

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
      deleteExpiredPrivateVoiceChats: deleteExpiredPrivateVoiceChatsMock
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

        expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(roomName, userAddress)
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
        deletePrivateVoiceChatMock.mockResolvedValue(usersInRoom)
        deleteRoomMock.mockResolvedValue(undefined)
      })

      it('should delete the private voice chat, delete the room and return the users that were in the room', async () => {
        const result = await voiceComponent.endPrivateVoiceChat(roomId, userAddress)

        expect(deletePrivateVoiceChatMock).toHaveBeenCalledWith(expectedRoomName, userAddress)
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
})
