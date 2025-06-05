import { DisconnectReason } from '@livekit/protocol'
import { IVoiceDBComponent } from '../../src/adapters/db/types'
import { IVoiceComponent } from '../../src/logic/voice/types'
import { createVoiceComponent } from '../../src/logic/voice/voice'
import { ILivekitComponent } from '../../src/types/livekit.type'

let voiceComponent: IVoiceComponent
let deleteRoomMock: jest.MockedFunction<ILivekitComponent['deleteRoom']>
let generateCredentialsMock: jest.MockedFunction<ILivekitComponent['generateCredentials']>
let getRoomUserIsInMock: jest.MockedFunction<IVoiceDBComponent['getRoomUserIsIn']>
let joinUserToRoomMock: jest.MockedFunction<IVoiceDBComponent['joinUserToRoom']>
let removeUserFromRoomMock: jest.MockedFunction<IVoiceDBComponent['removeUserFromRoom']>
let disconnectUserFromRoomMock: jest.MockedFunction<IVoiceDBComponent['disconnectUserFromRoom']>
let hasRoomExpiredMock: jest.MockedFunction<IVoiceDBComponent['isRoomActive']>

beforeEach(() => {
  deleteRoomMock = jest.fn()
  generateCredentialsMock = jest.fn()
  getRoomUserIsInMock = jest.fn()
  joinUserToRoomMock = jest.fn()
  removeUserFromRoomMock = jest.fn()
  disconnectUserFromRoomMock = jest.fn()
  hasRoomExpiredMock = jest.fn()

  const livekit: jest.Mocked<ILivekitComponent> = {
    deleteRoom: deleteRoomMock,
    generateCredentials: generateCredentialsMock
  } as jest.Mocked<ILivekitComponent>

  const voiceDB: jest.Mocked<IVoiceDBComponent> = {
    getRoomUserIsIn: getRoomUserIsInMock,
    joinUserToRoom: joinUserToRoomMock,
    removeUserFromRoom: removeUserFromRoomMock,
    disconnectUserFromRoom: disconnectUserFromRoomMock,
    isRoomActive: hasRoomExpiredMock
  }

  const logs = {
    getLogger: jest.fn().mockImplementation((name) => {
      return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    })
  }

  voiceComponent = createVoiceComponent({
    voiceDB,
    livekit,
    logs
  })
})

describe('when handling that a participant joined a room', () => {
  describe('and the room has expired', () => {
    beforeEach(() => {
      hasRoomExpiredMock.mockResolvedValue(true)
    })

    it('should delete the room and resolve', async () => {
      await expect(voiceComponent.handleParticipantJoined('0x123', 'room-1')).resolves.toBeUndefined()
      expect(deleteRoomMock).toHaveBeenCalledWith('room-1')
    })
  })

  describe('and the room has not expired', () => {
    beforeEach(() => {
      hasRoomExpiredMock.mockResolvedValue(false)
    })

    describe('and the user is not in a room', () => {
      beforeEach(() => {
        getRoomUserIsInMock.mockResolvedValue(null)
      })

      it('should join the user to the room and resolve', async () => {
        await expect(voiceComponent.handleParticipantJoined('0x123', 'room-1')).resolves.toBeUndefined()
        expect(joinUserToRoomMock).toHaveBeenCalledWith('0x123', 'room-1')
      })
    })

    describe('and the user is in the same room', () => {
      beforeEach(() => {
        getRoomUserIsInMock.mockResolvedValue('room-1')
      })

      it('should join the user to the room and resolve', async () => {
        await expect(voiceComponent.handleParticipantJoined('0x123', 'room-1')).resolves.toBeUndefined()
        expect(joinUserToRoomMock).toHaveBeenCalledWith('0x123', 'room-1')
      })
    })

    describe('and the user is in a different room', () => {
      beforeEach(() => {
        getRoomUserIsInMock.mockResolvedValue('room-2')
      })

      it('should join the user to the new room, delete the old room and resolve', async () => {
        await expect(voiceComponent.handleParticipantJoined('0x123', 'room-1')).resolves.toBeUndefined()
        expect(joinUserToRoomMock).toHaveBeenCalledWith('0x123', 'room-1')
        expect(deleteRoomMock).toHaveBeenCalledWith('room-2')
      })
    })
  })
})

describe('when handling that a participant left a room', () => {
  let disconnectReason: DisconnectReason

  describe('and the participant left because of a duplicate identity', () => {
    beforeEach(() => {
      disconnectReason = DisconnectReason.DUPLICATE_IDENTITY
    })

    it('should do nothing and resolve', async () => {
      await expect(voiceComponent.handleParticipantLeft('0x123', 'room-1', disconnectReason)).resolves.toBeUndefined()
      expect(disconnectUserFromRoomMock).not.toHaveBeenCalled()
    })
  })

  describe('and the participant left because of an unknown error', () => {
    beforeEach(() => {
      disconnectReason = DisconnectReason.MIGRATION
    })

    it('should disconnect the user from the room and resolve', async () => {
      await expect(voiceComponent.handleParticipantLeft('0x123', 'room-1', disconnectReason)).resolves.toBeUndefined()
      expect(disconnectUserFromRoomMock).toHaveBeenCalledWith('0x123', 'room-1')
    })
  })

  describe('and the participant left willingly', () => {
    beforeEach(() => {
      disconnectReason = DisconnectReason.CLIENT_INITIATED
    })

    it('should delete the room, disconnect the user from the room and resolve', async () => {
      await expect(voiceComponent.handleParticipantLeft('0x123', 'room-1', disconnectReason)).resolves.toBeUndefined()
      expect(deleteRoomMock).toHaveBeenCalledWith('room-1')
      expect(disconnectUserFromRoomMock).toHaveBeenCalledWith('0x123', 'room-1')
    })
  })
})

describe('when checking if a user is in a voice chat', () => {
  describe('and the user is in a room', () => {
    beforeEach(() => {
      getRoomUserIsInMock.mockResolvedValue('room-1')
    })

    it('should return true', async () => {
      await expect(voiceComponent.isUserInVoiceChat('0x123')).resolves.toBe(true)
    })
  })

  describe('and the user is not in a room', () => {
    beforeEach(() => {
      getRoomUserIsInMock.mockResolvedValue(null)
    })

    it('should return false', async () => {
      await expect(voiceComponent.isUserInVoiceChat('0x123')).resolves.toBe(false)
    })
  })
})
