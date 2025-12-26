import { RoomServiceClient, Room, AccessToken, IngressClient, WebhookReceiver } from 'livekit-server-sdk'
import { createLivekitComponent } from '../../src/adapters/livekit'
import { ILivekitComponent } from '../../src/types/livekit.type'

let livekitComponent: ILivekitComponent
let deleteRoomSpy: jest.SpyInstance<Promise<void>, [roomName: string]>
let listRoomsSpy: jest.SpyInstance<Promise<Room[]>, [names?: string[]]>
let createRoomSpy: jest.SpyInstance<Promise<Room>, [options: any]>
let updateParticipantMetadataSpy: jest.SpyInstance
let updateParticipantSpy: jest.SpyInstance
let updateRoomMetadataSpy: jest.SpyInstance
let listParticipantsSpy: jest.SpyInstance
let accessTokenToJwtSpy: jest.SpyInstance
let listIngressSpy: jest.SpyInstance
let createIngressSpy: jest.SpyInstance
let webhookReceiverSpy: jest.SpyInstance

beforeEach(async () => {
  deleteRoomSpy = jest.spyOn(RoomServiceClient.prototype, 'deleteRoom')
  listRoomsSpy = jest.spyOn(RoomServiceClient.prototype, 'listRooms')
  createRoomSpy = jest.spyOn(RoomServiceClient.prototype, 'createRoom')
  updateParticipantMetadataSpy = jest.spyOn(RoomServiceClient.prototype, 'updateParticipant')
  updateParticipantSpy = jest.spyOn(RoomServiceClient.prototype, 'updateParticipant')
  updateRoomMetadataSpy = jest.spyOn(RoomServiceClient.prototype, 'updateRoomMetadata')
  listParticipantsSpy = jest.spyOn(RoomServiceClient.prototype, 'listParticipants')
  accessTokenToJwtSpy = jest.spyOn(AccessToken.prototype, 'toJwt').mockResolvedValue('mock-jwt-token')
  listIngressSpy = jest.spyOn(IngressClient.prototype, 'listIngress')
  createIngressSpy = jest.spyOn(IngressClient.prototype, 'createIngress')
  webhookReceiverSpy = jest.spyOn(WebhookReceiver.prototype, 'receive')

  livekitComponent = await createLivekitComponent({
    config: {
      requireString: jest.fn().mockImplementation((key) => {
        switch (key) {
          case 'WORLD_ROOM_PREFIX':
            return Promise.resolve('world-')
          case 'SCENE_ROOM_PREFIX':
            return Promise.resolve('scene-')
          case 'PRIVATE_MESSAGES_ROOM_ID':
            return Promise.resolve('private-messages')
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

describe('when getting a world room name', () => {
  it('should return world room name with prefix', () => {
    const worldName = 'test-world'
    const result = livekitComponent.getWorldRoomName(worldName)
    expect(result).toBe('world-test-world')
  })
})

describe('when getting a scene room name', () => {
  it('should return scene room name with prefix', () => {
    const realmName = 'test-realm'
    const sceneId = 'test-scene'
    const result = livekitComponent.getSceneRoomName(realmName, sceneId)
    expect(result).toBe('scene-test-realm:test-scene')
  })
})

describe('when getting a room name', () => {
  describe('when isWorld is true', () => {
    it('should return world room name', () => {
      const realmName = 'test-realm'
      const result = livekitComponent.getRoomName(realmName, { isWorld: true })
      expect(result).toBe('world-test-realm')
    })
  })

  describe('when isWorld is false', () => {
    it('should return scene room name when sceneId is provided', () => {
      const realmName = 'test-realm'
      const sceneId = 'test-scene'
      const result = livekitComponent.getRoomName(realmName, { isWorld: false, sceneId })
      expect(result).toBe('scene-test-realm:test-scene')
    })

    it('should throw error when sceneId is not provided', () => {
      const realmName = 'test-realm'
      expect(() => {
        livekitComponent.getRoomName(realmName, { isWorld: false })
      }).toThrow('No sceneId provided for scene room')
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
      expect(updateParticipantMetadataSpy).toHaveBeenCalledWith(roomId, participantId, JSON.stringify(newMetadata))
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
      expect(updateParticipantMetadataSpy).toHaveBeenCalledWith(roomId, participantId, JSON.stringify(newMetadata))
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
      expect(updateParticipantMetadataSpy).toHaveBeenCalledWith(roomId, participantId, JSON.stringify(newMetadata))
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

      await expect(livekitComponent.updateParticipantMetadata(roomId, participantId, newMetadata)).rejects.toThrow(
        'Failed to update participant'
      )

      expect(listParticipantsSpy).toHaveBeenCalledWith(roomId)
      expect(updateParticipantMetadataSpy).toHaveBeenCalled()
    })
  })
})

describe('when building connection URL', () => {
  it('should return properly formatted connection URL', () => {
    const url = 'wss://test.livekit.com'
    const token = 'test-token'
    const result = livekitComponent.buildConnectionUrl(url, token)
    expect(result).toBe('livekit:wss://test.livekit.com?access_token=test-token')
  })
})

describe('when generating credentials', () => {
  const identity = 'test-user'
  const roomId = 'test-room'
  const permissions = {
    canPublish: true,
    canSubscribe: true,
    canUpdateOwnMetadata: true,
    cast: []
  }

  describe('for production environment', () => {
    it('should generate credentials with production settings', async () => {
      const result = await livekitComponent.generateCredentials(identity, roomId, permissions, false)

      expect(result.url).toBe('wss://prod.livekit.example.com')
      expect(result.token).toBe('mock-jwt-token')
      expect(accessTokenToJwtSpy).toHaveBeenCalled()
    })

    it('should generate credentials with metadata', async () => {
      const metadata = { role: 'moderator' }
      const result = await livekitComponent.generateCredentials(identity, roomId, permissions, false, metadata)

      expect(result.url).toBe('wss://prod.livekit.example.com')
      expect(result.token).toBe('mock-jwt-token')
      expect(accessTokenToJwtSpy).toHaveBeenCalled()
    })
  })

  describe('for preview environment', () => {
    it('should generate credentials with preview settings', async () => {
      const result = await livekitComponent.generateCredentials(identity, roomId, permissions, true)

      expect(result.url).toBe('wss://preview.livekit.example.com')
      expect(result.token).toBe('mock-jwt-token')
      expect(accessTokenToJwtSpy).toHaveBeenCalled()
    })
  })

  describe('when user is in cast list', () => {
    it('should allow all sources for cast members', async () => {
      const castPermissions = {
        ...permissions,
        cast: [identity]
      }

      const result = await livekitComponent.generateCredentials(identity, roomId, castPermissions, false)

      expect(result.url).toBe('wss://prod.livekit.example.com')
      expect(result.token).toBe('mock-jwt-token')
      expect(accessTokenToJwtSpy).toHaveBeenCalled()
    })
  })
})

describe('when muting a participant', () => {
  const roomId = 'test-room'
  const participantId = 'test-participant'

  beforeEach(() => {
    updateParticipantSpy.mockResolvedValue(undefined)
  })

  it('should mute participant by removing publish sources', async () => {
    await livekitComponent.muteParticipant(roomId, participantId)

    expect(updateParticipantSpy).toHaveBeenCalledWith(roomId, participantId, undefined, {
      canPublishSources: []
    })
  })
})

describe('when updating participant permissions', () => {
  const roomId = 'test-room'
  const participantId = 'test-participant'
  const permissions = {
    canPublish: false,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: true,
    canPublishSources: []
  }

  beforeEach(() => {
    updateParticipantSpy.mockResolvedValue(undefined)
  })

  it('should update participant permissions', async () => {
    await livekitComponent.updateParticipantPermissions(roomId, participantId, permissions)

    expect(updateParticipantSpy).toHaveBeenCalledWith(roomId, participantId, undefined, permissions)
  })
})

describe('when getting or creating ingress', () => {
  const roomName = 'test-room'
  const participantIdentity = 'test-participant'
  const mockIngress = {
    ingressId: 'ingress-123',
    name: `${roomName}-ingress`,
    roomName: roomName,
    participantIdentity: participantIdentity,
    url: 'rtmp://test.com/live',
    streamKey: 'stream-key-123'
  }

  describe('when ingress already exists', () => {
    beforeEach(() => {
      listIngressSpy.mockResolvedValue([mockIngress])
    })

    it('should return existing ingress', async () => {
      const result = await livekitComponent.getOrCreateIngress(roomName, participantIdentity)

      expect(result).toBe(mockIngress)
      expect(listIngressSpy).toHaveBeenCalledWith({ roomName })
      expect(createIngressSpy).not.toHaveBeenCalled()
    })
  })

  describe('when ingress does not exist', () => {
    beforeEach(() => {
      listIngressSpy.mockResolvedValue([])
      createIngressSpy.mockResolvedValue(mockIngress)
    })

    it('should create new ingress and return it', async () => {
      const result = await livekitComponent.getOrCreateIngress(roomName, participantIdentity)

      expect(result).toBe(mockIngress)
      expect(listIngressSpy).toHaveBeenCalledWith({ roomName })
      expect(createIngressSpy).toHaveBeenCalledWith(0, {
        name: `${roomName}-ingress`,
        roomName: roomName,
        participantIdentity
      })
    })
  })
})

describe('when updating room metadata', () => {
  const roomId = 'test-room'
  const mockRoom = {
    sid: 'room-sid',
    name: roomId,
    emptyTimeout: 0,
    maxParticipants: 100,
    creationTime: BigInt(Date.now()),
    turnPassword: '',
    enabledCodecs: [],
    numParticipants: 2,
    numPublishers: 1,
    activeRecording: false,
    metadata: JSON.stringify({
      existingField: 'existingValue',
      anotherField: 'anotherValue'
    })
  } as Room

  beforeEach(() => {
    updateRoomMetadataSpy.mockResolvedValue(undefined)
  })

  describe('when room has no existing metadata', () => {
    beforeEach(() => {
      const roomWithoutMetadata = { ...mockRoom, metadata: undefined } as Room
      listRoomsSpy.mockResolvedValue([roomWithoutMetadata])
    })

    it('should update with only the new metadata', async () => {
      const newMetadata = { bannedAddresses: ['0x123', '0x456'] }
      await livekitComponent.updateRoomMetadata(roomId, newMetadata)

      expect(listRoomsSpy).toHaveBeenCalledWith([roomId])
      expect(updateRoomMetadataSpy).toHaveBeenCalledWith(roomId, JSON.stringify(newMetadata))
    })
  })

  describe('when room has existing metadata', () => {
    beforeEach(() => {
      listRoomsSpy.mockResolvedValue([mockRoom])
    })

    it('should merge existing metadata with new metadata', async () => {
      const newMetadata = { bannedAddresses: ['0x123', '0x456'] }
      await livekitComponent.updateRoomMetadata(roomId, newMetadata)

      const expectedMergedMetadata = {
        existingField: 'existingValue',
        anotherField: 'anotherValue',
        bannedAddresses: ['0x123', '0x456']
      }

      expect(listRoomsSpy).toHaveBeenCalledWith([roomId])
      expect(updateRoomMetadataSpy).toHaveBeenCalledWith(roomId, JSON.stringify(expectedMergedMetadata))
    })

    it('should override existing fields with new values', async () => {
      const newMetadata = {
        existingField: 'updatedValue', // Override existing field
        bannedAddresses: ['0x123', '0x456'] // Add new field
      }
      await livekitComponent.updateRoomMetadata(roomId, newMetadata)

      const expectedMergedMetadata = {
        existingField: 'updatedValue', // Updated value
        anotherField: 'anotherValue', // Preserved existing value
        bannedAddresses: ['0x123', '0x456'] // New field
      }

      expect(updateRoomMetadataSpy).toHaveBeenCalledWith(roomId, JSON.stringify(expectedMergedMetadata))
    })
  })

  describe('when room has invalid JSON metadata', () => {
    beforeEach(() => {
      const roomWithInvalidMetadata = { ...mockRoom, metadata: '{ invalid json' } as Room
      listRoomsSpy.mockResolvedValue([roomWithInvalidMetadata])
    })

    it('should treat existing metadata as empty object and use only new metadata', async () => {
      const newMetadata = { bannedAddresses: ['0x123', '0x456'] }
      await livekitComponent.updateRoomMetadata(roomId, newMetadata)

      expect(updateRoomMetadataSpy).toHaveBeenCalledWith(roomId, JSON.stringify(newMetadata))
    })
  })

  describe('when room is not found', () => {
    beforeEach(() => {
      listRoomsSpy.mockResolvedValue([])
    })

    it('should update with only new metadata (no existing metadata to merge)', async () => {
      const newMetadata = { bannedAddresses: ['0x123', '0x456'] }
      await livekitComponent.updateRoomMetadata(roomId, newMetadata)

      expect(listRoomsSpy).toHaveBeenCalledWith([roomId])
      expect(updateRoomMetadataSpy).toHaveBeenCalledWith(roomId, JSON.stringify(newMetadata))
    })
  })

  describe('when getting room info fails', () => {
    beforeEach(() => {
      listRoomsSpy.mockRejectedValue(new Error('Failed to list rooms'))
    })

    it('should still try to update metadata (getRoomInfo catches errors internally)', async () => {
      const newMetadata = { bannedAddresses: ['0x123', '0x456'] }

      // getRoomInfo catches errors and returns null, so the update should still proceed
      // with just the new metadata (no existing metadata to merge)
      await livekitComponent.updateRoomMetadata(roomId, newMetadata)

      expect(listRoomsSpy).toHaveBeenCalledWith([roomId])
      expect(updateRoomMetadataSpy).toHaveBeenCalledWith(roomId, JSON.stringify(newMetadata))
    })
  })

  describe('when updating room metadata fails', () => {
    beforeEach(() => {
      listRoomsSpy.mockResolvedValue([mockRoom])
      updateRoomMetadataSpy.mockRejectedValue(new Error('Failed to update room metadata'))
    })

    it('should propagate the error', async () => {
      const newMetadata = { bannedAddresses: ['0x123', '0x456'] }

      await expect(livekitComponent.updateRoomMetadata(roomId, newMetadata)).rejects.toThrow(
        'Failed to update room metadata'
      )

      expect(listRoomsSpy).toHaveBeenCalledWith([roomId])
      expect(updateRoomMetadataSpy).toHaveBeenCalled()
    })
  })
})

describe('when getting room metadata from room name', () => {
  describe('when room name is a scene room', () => {
    it('should extract realm name and scene ID and return SCENE room type', () => {
      const roomName = 'scene-realm1:scene-id-123'
      const result = livekitComponent.getRoomMetadataFromRoomName(roomName)

      expect(result).toEqual({
        realmName: 'realm1',
        sceneId: 'scene-id-123',
        roomType: 'scene'
      })
    })
  })

  describe('when room name is a world room', () => {
    it('should extract world name and return WORLD room type', () => {
      const roomName = 'world-world-name-123'
      const result = livekitComponent.getRoomMetadataFromRoomName(roomName)

      expect(result).toEqual({
        worldName: 'world-name-123',
        roomType: 'world'
      })
    })
  })

  describe('when room name is a community voice chat room', () => {
    it('should extract community ID and return COMMUNITY_VOICE_CHAT room type', () => {
      const roomName = 'voice-chat-community-community-id-123'
      const result = livekitComponent.getRoomMetadataFromRoomName(roomName)

      expect(result).toEqual({
        communityId: 'community-id-123',
        roomType: 'community-voice-chat'
      })
    })
  })

  describe('when room name is a private voice chat room', () => {
    it('should extract voice chat ID and return VOICE_CHAT room type', () => {
      const roomName = 'voice-chat-private-call-id-123'
      const result = livekitComponent.getRoomMetadataFromRoomName(roomName)

      expect(result).toEqual({
        voiceChatId: 'call-id-123',
        roomType: 'voice-chat'
      })
    })
  })

  describe('when room name is an island room', () => {
    it('should extract island name and return ISLAND room type', () => {
      const roomName = 'island-island-name-123'
      const result = livekitComponent.getRoomMetadataFromRoomName(roomName)

      expect(result).toEqual({
        islandName: 'island-name-123',
        roomType: 'island'
      })
    })
  })

  describe('when room name is a private messages room', () => {
    it('should return PRIVATE_MESSAGE room type', () => {
      const roomName = 'private-messages'
      const result = livekitComponent.getRoomMetadataFromRoomName(roomName)

      expect(result).toEqual({
        roomType: 'private-message'
      })
    })
  })

  describe('when room name is unknown', () => {
    it('should return UNKNOWN room type', () => {
      const roomName = 'unknown-room-name'
      const result = livekitComponent.getRoomMetadataFromRoomName(roomName)

      expect(result).toEqual({
        roomType: 'unknown'
      })
    })
  })
})

describe('when getting webhook event', () => {
  const body = '{"event": "room_finished"}'
  const authorization = 'Bearer token123'

  beforeEach(() => {
    webhookReceiverSpy.mockResolvedValue({ event: 'room_finished' })
  })

  it('should process webhook event and return parsed data', async () => {
    const result = await livekitComponent.getWebhookEvent(body, authorization)

    expect(result).toEqual({ event: 'room_finished' })
    expect(webhookReceiverSpy).toHaveBeenCalledWith(body, authorization)
  })
})
