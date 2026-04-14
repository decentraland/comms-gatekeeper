import { RoomType } from '@dcl/schemas'
import { getStreamInfoHandler } from '../../../src/controllers/handlers/cast/get-stream-info-handler'
import { InvalidRequestError } from '../../../src/types/errors'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createPlacesMockedComponent, createMockedPlace, createMockedWorldPlace } from '../../mocks/places-mock'

describe('when getting stream info', () => {
  let mockLivekit: ReturnType<typeof createLivekitMockedComponent>
  let mockLogs: ReturnType<typeof createLoggerMockedComponent>
  let mockSceneStreamAccessManager: ReturnType<typeof createSceneStreamAccessManagerMockedComponent>
  let mockPlaces: ReturnType<typeof createPlacesMockedComponent>

  const validStreamAccess = {
    id: 'access-123',
    place_id: 'place-123',
    streaming_key: 'valid-stream-key',
    streaming_url: 'rtmp://test-url',
    ingress_id: 'test-ingress-id',
    created_at: Date.now(),
    active: true,
    streaming: false,
    streaming_start_time: 0,
    room_id: 'scene-fenrir:bafytest123',
    expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
  }

  beforeEach(() => {
    mockLivekit = createLivekitMockedComponent({
      getRoomMetadataFromRoomName: jest.fn().mockReturnValue({ realmName: 'fenrir', roomType: RoomType.SCENE })
    })
    mockLogs = createLoggerMockedComponent()
    mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
      getAccessByStreamingKey: jest.fn().mockResolvedValue(validStreamAccess)
    })
    mockPlaces = createPlacesMockedComponent({
      getPlaceStatusByIds: jest
        .fn()
        .mockResolvedValue([createMockedPlace({ id: 'place-123', title: 'Test Place', owner: '0xowner' })])
    })
  })

  function createContext(streamingKey: string) {
    return {
      components: {
        logs: mockLogs,
        sceneStreamAccessManager: mockSceneStreamAccessManager,
        places: mockPlaces,
        livekit: mockLivekit
      },
      params: { streamingKey }
    } as any
  }

  describe('and the streaming key is missing', () => {
    it('should throw an InvalidRequestError', async () => {
      await expect(getStreamInfoHandler(createContext(''))).rejects.toThrow(InvalidRequestError)
    })
  })

  describe('and the streaming key is invalid', () => {
    beforeEach(() => {
      mockSceneStreamAccessManager.getAccessByStreamingKey.mockResolvedValue(null)
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(getStreamInfoHandler(createContext('invalid-key'))).rejects.toThrow(InvalidRequestError)
    })
  })

  describe('and the stream access is not active', () => {
    beforeEach(() => {
      mockSceneStreamAccessManager.getAccessByStreamingKey.mockResolvedValue({
        ...validStreamAccess,
        active: false
      })
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(getStreamInfoHandler(createContext('valid-stream-key'))).rejects.toThrow(InvalidRequestError)
    })
  })

  describe('and the stream access has expired', () => {
    beforeEach(() => {
      mockSceneStreamAccessManager.getAccessByStreamingKey.mockResolvedValue({
        ...validStreamAccess,
        expiration_time: String(Date.now() - 1000)
      })
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(getStreamInfoHandler(createContext('valid-stream-key'))).rejects.toThrow(InvalidRequestError)
    })
  })

  describe('and the stream access has no room_id', () => {
    beforeEach(() => {
      mockSceneStreamAccessManager.getAccessByStreamingKey.mockResolvedValue({
        ...validStreamAccess,
        room_id: undefined
      })
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(getStreamInfoHandler(createContext('valid-stream-key'))).rejects.toThrow(InvalidRequestError)
    })
  })

  describe('and the stream is for a local preview', () => {
    beforeEach(() => {
      mockLivekit.getRoomMetadataFromRoomName.mockReturnValue({ realmName: 'localpreview', roomType: RoomType.SCENE })
      mockLivekit.isLocalPreview.mockReturnValue(true)
    })

    it('should return local preview info without calling Places API', async () => {
      const result = await getStreamInfoHandler(createContext('valid-stream-key'))

      expect(result.status).toBe(200)
      expect(result.body).toEqual({
        placeName: 'Local Preview',
        placeId: 'place-123',
        location: 'preview',
        isWorld: false
      })
      expect(mockPlaces.getPlaceStatusByIds).not.toHaveBeenCalled()
    })
  })

  describe('and the stream is for a regular place', () => {
    describe('and the place is not found', () => {
      beforeEach(() => {
        mockPlaces.getPlaceStatusByIds.mockResolvedValue([])
      })

      it('should throw an InvalidRequestError', async () => {
        await expect(getStreamInfoHandler(createContext('valid-stream-key'))).rejects.toThrow(InvalidRequestError)
      })
    })

    describe('and the place is a world', () => {
      beforeEach(() => {
        mockPlaces.getPlaceStatusByIds.mockResolvedValue([
          createMockedWorldPlace({ id: 'place-123', title: 'Test World', world_name: 'test-world.dcl.eth' })
        ])
      })

      it('should return placeName as world_name and isWorld true', async () => {
        const result = await getStreamInfoHandler(createContext('valid-stream-key'))

        expect(result.status).toBe(200)
        expect(result.body.placeName).toBe('test-world.dcl.eth')
        expect(result.body.isWorld).toBe(true)
        expect(result.body.location).toBe('test-world.dcl.eth')
      })
    })

    describe('and the place is not a world', () => {
      it('should return placeName as base_position and isWorld false', async () => {
        const result = await getStreamInfoHandler(createContext('valid-stream-key'))

        expect(result.status).toBe(200)
        expect(result.body.isWorld).toBe(false)
        expect(result.body.location).toBe('-9,-9')
      })
    })

    describe('and the place is a world with null world_name', () => {
      beforeEach(() => {
        mockPlaces.getPlaceStatusByIds.mockResolvedValue([
          createMockedWorldPlace({ id: 'place-123', title: 'Test World', world_name: null })
        ])
      })

      it('should fall back to base_position for location', async () => {
        const result = await getStreamInfoHandler(createContext('valid-stream-key'))

        expect(result.status).toBe(200)
        expect(result.body.location).toBe('-9,-9')
      })
    })
  })
})
