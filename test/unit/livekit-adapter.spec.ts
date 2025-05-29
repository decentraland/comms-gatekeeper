import { RoomServiceClient } from 'livekit-server-sdk'
import { createLivekitComponent } from '../../src/adapters/livekit'
import { ILivekitComponent } from '../../src/types/livekit.type'

let livekitComponent: ILivekitComponent
let deleteRoomSpy: jest.SpyInstance<Promise<void>, [roomName: string]>

beforeEach(async () => {
  deleteRoomSpy = jest.spyOn(RoomServiceClient.prototype, 'deleteRoom')

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
      await livekitComponent.destroyRoom(roomName)
      expect(deleteRoomSpy).toHaveBeenCalledWith(roomName)
    })
  })

  describe('when the room does not exist', () => {
    beforeEach(() => {
      deleteRoomSpy.mockRejectedValue(new Error('Room not found'))
    })

    it('should resolve', async () => {
      await expect(livekitComponent.destroyRoom(roomName)).resolves.toBeUndefined()
    })
  })
})
