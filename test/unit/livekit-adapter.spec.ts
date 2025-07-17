import { RoomServiceClient, Room } from 'livekit-server-sdk'
import { createLivekitComponent } from '../../src/adapters/livekit'
import { ILivekitComponent } from '../../src/types/livekit.type'

let livekitComponent: ILivekitComponent
let deleteRoomSpy: jest.SpyInstance<Promise<void>, [roomName: string]>
let listRoomsSpy: jest.SpyInstance<Promise<Room[]>, [names?: string[]]>
let createRoomSpy: jest.SpyInstance<Promise<Room>, [options: any]>
let updateParticipantMetadataSpy: jest.SpyInstance
let listParticipantsSpy: jest.SpyInstance

beforeEach(async () => {
  deleteRoomSpy = jest.spyOn(RoomServiceClient.prototype, 'deleteRoom')
  listRoomsSpy = jest.spyOn(RoomServiceClient.prototype, 'listRooms')
  createRoomSpy = jest.spyOn(RoomServiceClient.prototype, 'createRoom')
  updateParticipantMetadataSpy = jest.spyOn(RoomServiceClient.prototype, 'updateParticipant')
  listParticipantsSpy = jest.spyOn(RoomServiceClient.prototype, 'listParticipants')

  livekitComponent = await createLivekitComponent({
    config: {
      requireString: jest.fn().mockImplementation((key) => {
        switch (key) {
          case 'WORLD_ROOM_PREFIX':
            return Promise.resolve('world-')
          case 'SCENE_ROOM_PREFIX':
            return Promise.resolve('scene-')
          case 'PROD_LIVEKIT_HOST':
            return Promise.resolve('prod.livekit.example.com')
          case 'PROD_LIVEKIT_API_KEY':
            return Promise.resolve('prod-api-key')
          case 'PROD_LIVEKIT_API_SECRET':
            return Promise.resolve('prod-secret')
          case 'PREVIEW_LIVEKIT_HOST':
            return Promise.resolve('preview.livekit.example.com')
          case 'PREVIEW_LIVEKIT_API_KEY':
            return Promise.resolve('preview-api-key')
          case 'PREVIEW_LIVEKIT_API_SECRET':
            return Promise.resolve('preview-secret')
          default:
            return Promise.reject(new Error(`Unknown key: ${key}`))
        }
      }),
      getString: jest.fn().mockReturnValue(''),
      getNumber: jest.fn().mockReturnValue(0),
      requireNumber: jest.fn().mockResolvedValue(0)
    },
    logs: {
      getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      })
    }
  })
})

describe('when destroying a room', () => {
  const roomName = 'test-room'

  describe('when the room exists', () => {
    beforeEach(() => {
      deleteRoomSpy.mockResolvedValue(undefined)
    })

    it('should destroy the room and resolve', async () => {
      await livekitComponent.deleteRoom(roomName)
      expect(deleteRoomSpy).toHaveBeenCalledWith(roomName)
    })
  })

  describe('when the room does not exist', () => {
    beforeEach(() => {
      deleteRoomSpy.mockRejectedValue(new Error('Room not found'))
    })

    it('should resolve', async () => {
      await expect(livekitComponent.deleteRoom(roomName)).resolves.toBeUndefined()
    })
  })
})

describe('when getting room info', () => {
  const roomName = 'test-room'
  const mockRoom = {
    sid: 'room-sid',
    name: roomName,
    emptyTimeout: 0,
    maxParticipants: 100,
    creationTime: BigInt(Date.now()),
    turnPassword: '',
    enabledCodecs: [],
    numParticipants: 2,
    numPublishers: 1,
    activeRecording: false
  } as Room

  describe('when the room exists', () => {
    beforeEach(() => {
      listRoomsSpy.mockResolvedValue([mockRoom])
    })

    it('should return the room info', async () => {
      const result = await livekitComponent.getRoomInfo(roomName)
      expect(result).toEqual(mockRoom)
      expect(listRoomsSpy).toHaveBeenCalledWith([roomName])
    })
  })

  describe('when the room does not exist', () => {
    beforeEach(() => {
      listRoomsSpy.mockResolvedValue([])
    })

    it('should return null', async () => {
      const result = await livekitComponent.getRoomInfo(roomName)
      expect(result).toBeNull()
      expect(listRoomsSpy).toHaveBeenCalledWith([roomName])
    })
  })

  describe('when an error occurs', () => {
    beforeEach(() => {
      listRoomsSpy.mockRejectedValue(new Error('Network error'))
    })

    it('should return null and log warning', async () => {
      const result = await livekitComponent.getRoomInfo(roomName)
      expect(result).toBeNull()
    })
  })
})

describe('when getting or creating a room', () => {
  const roomName = 'test-room'
  const mockRoom = {
    sid: 'room-sid',
    name: roomName,
    emptyTimeout: 0,
    maxParticipants: 100,
    creationTime: BigInt(Date.now()),
    turnPassword: '',
    enabledCodecs: [],
    numParticipants: 0,
    numPublishers: 0,
    activeRecording: false
  } as Room

  describe('when the room exists', () => {
    beforeEach(() => {
      listRoomsSpy.mockResolvedValue([mockRoom])
    })

    it('should return the existing room', async () => {
      const result = await livekitComponent.getRoom(roomName)
      expect(result).toEqual(mockRoom)
      expect(listRoomsSpy).toHaveBeenCalledWith([roomName])
      expect(createRoomSpy).not.toHaveBeenCalled()
    })
  })

  describe('when the room does not exist', () => {
    beforeEach(() => {
      listRoomsSpy.mockResolvedValue([])
      createRoomSpy.mockResolvedValue(mockRoom)
    })

    it('should create and return a new room', async () => {
      const result = await livekitComponent.getRoom(roomName)
      expect(result).toEqual(mockRoom)
      expect(listRoomsSpy).toHaveBeenCalledWith([roomName])
      expect(createRoomSpy).toHaveBeenCalledWith({
        name: roomName
      })
    })
  })
})

describe('when updating participant metadata', () => {
  const roomId = 'test-room'
  const participantId = 'test-participant'

  beforeEach(() => {
    updateParticipantMetadataSpy.mockResolvedValue(undefined)
  })

  describe('when participant has no existing metadata', () => {
    beforeEach(() => {
      // Mock participant with no metadata
      listParticipantsSpy.mockResolvedValue([
        {
          identity: participantId,
          metadata: undefined // No existing metadata
        }
      ])
    })

    it('should update with only the new metadata', async () => {
      const newMetadata = { isRequestingToSpeak: true }
      await livekitComponent.updateParticipantMetadata(roomId, participantId, newMetadata)

      expect(listParticipantsSpy).toHaveBeenCalledWith(roomId)
      expect(updateParticipantMetadataSpy).toHaveBeenCalledWith(
        roomId, 
        participantId, 
        JSON.stringify(newMetadata)
      )
    })
  })

  describe('when participant has existing metadata', () => {
    beforeEach(() => {
      // Mock participant with existing metadata
      listParticipantsSpy.mockResolvedValue([
        {
          identity: participantId,
          metadata: JSON.stringify({ 
            role: 'moderator', 
            joinedAt: '2023-01-01T00:00:00Z',
            someOtherField: 'value'
          })
        }
      ])
    })

    it('should merge existing metadata with new metadata', async () => {
      const newMetadata = { isRequestingToSpeak: true }
      await livekitComponent.updateParticipantMetadata(roomId, participantId, newMetadata)

      const expectedMergedMetadata = {
        role: 'moderator',
        joinedAt: '2023-01-01T00:00:00Z', 
        someOtherField: 'value',
        isRequestingToSpeak: true // New field added
      }

      expect(listParticipantsSpy).toHaveBeenCalledWith(roomId)
      expect(updateParticipantMetadataSpy).toHaveBeenCalledWith(
        roomId, 
        participantId, 
        JSON.stringify(expectedMergedMetadata)
      )
    })

    it('should override existing fields with new values', async () => {
      const newMetadata = { 
        role: 'member', // Override existing role
        isRequestingToSpeak: true // Add new field
      }
      await livekitComponent.updateParticipantMetadata(roomId, participantId, newMetadata)

      const expectedMergedMetadata = {
        role: 'member', // Updated value
        joinedAt: '2023-01-01T00:00:00Z', // Preserved existing value
        someOtherField: 'value', // Preserved existing value
        isRequestingToSpeak: true // New field
      }

      expect(updateParticipantMetadataSpy).toHaveBeenCalledWith(
        roomId, 
        participantId, 
        JSON.stringify(expectedMergedMetadata)
      )
    })
  })

  describe('when participant has invalid JSON metadata', () => {
    beforeEach(() => {
      // Mock participant with invalid JSON metadata
      listParticipantsSpy.mockResolvedValue([
        {
          identity: participantId,
          metadata: '{ invalid json' // Malformed JSON
        }
      ])
    })

    it('should treat existing metadata as empty object and use only new metadata', async () => {
      const newMetadata = { isRequestingToSpeak: true }
      await livekitComponent.updateParticipantMetadata(roomId, participantId, newMetadata)

      expect(updateParticipantMetadataSpy).toHaveBeenCalledWith(
        roomId, 
        participantId, 
        JSON.stringify(newMetadata) // Only new metadata, existing ignored due to parse error
      )
    })
  })

  describe('when participant is not found', () => {
    beforeEach(() => {
      // Mock empty participants list
      listParticipantsSpy.mockResolvedValue([])
    })

    it('should update with only new metadata (no existing metadata to merge)', async () => {
      const newMetadata = { isRequestingToSpeak: true }
      await livekitComponent.updateParticipantMetadata(roomId, participantId, newMetadata)

      expect(listParticipantsSpy).toHaveBeenCalledWith(roomId)
      expect(updateParticipantMetadataSpy).toHaveBeenCalledWith(
        roomId, 
        participantId, 
        JSON.stringify(newMetadata)
      )
    })
  })

  describe('when getting participant info fails', () => {
    beforeEach(() => {
      listParticipantsSpy.mockRejectedValue(new Error('Failed to list participants'))
    })

    it('should still try to update metadata (getParticipantInfo catches errors internally)', async () => {
      const newMetadata = { isRequestingToSpeak: true }
      
      // getParticipantInfo catches errors and returns null, so the update should still proceed
      // with just the new metadata (no existing metadata to merge)
      await livekitComponent.updateParticipantMetadata(roomId, participantId, newMetadata)

      expect(listParticipantsSpy).toHaveBeenCalledWith(roomId)
      expect(updateParticipantMetadataSpy).toHaveBeenCalledWith(
        roomId, 
        participantId, 
        JSON.stringify(newMetadata)
      )
    })
  })

  describe('when updating participant fails', () => {
    beforeEach(() => {
      listParticipantsSpy.mockResolvedValue([
        {
          identity: participantId,
          metadata: JSON.stringify({ role: 'moderator' })
        }
      ])
      updateParticipantMetadataSpy.mockRejectedValue(new Error('Failed to update participant'))
    })

    it('should propagate the error', async () => {
      const newMetadata = { isRequestingToSpeak: true }
      
      await expect(
        livekitComponent.updateParticipantMetadata(roomId, participantId, newMetadata)
      ).rejects.toThrow('Failed to update participant')

      expect(listParticipantsSpy).toHaveBeenCalledWith(roomId)
      expect(updateParticipantMetadataSpy).toHaveBeenCalled()
    })
  })
})
