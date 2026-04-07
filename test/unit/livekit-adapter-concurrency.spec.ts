import { RoomServiceClient, Room, AccessToken, IngressClient, WebhookReceiver } from 'livekit-server-sdk'
import { createLivekitComponent } from '../../src/adapters/livekit'
import { ILivekitComponent } from '../../src/types/livekit.type'

describe('when writing room metadata concurrently', () => {
  let livekitComponent: ILivekitComponent
  let listRoomsSpy: jest.SpyInstance
  let updateRoomMetadataSpy: jest.SpyInstance

  beforeEach(async () => {
    listRoomsSpy = jest.spyOn(RoomServiceClient.prototype, 'listRooms')
    updateRoomMetadataSpy = jest.spyOn(RoomServiceClient.prototype, 'updateRoomMetadata')
    jest.spyOn(RoomServiceClient.prototype, 'createRoom').mockResolvedValue(new Room())
    jest.spyOn(RoomServiceClient.prototype, 'deleteRoom').mockResolvedValue(undefined)
    jest.spyOn(RoomServiceClient.prototype, 'removeParticipant').mockResolvedValue(undefined)
    jest.spyOn(RoomServiceClient.prototype, 'updateParticipant').mockResolvedValue(undefined as any)
    jest.spyOn(RoomServiceClient.prototype, 'listParticipants').mockResolvedValue([])
    jest.spyOn(AccessToken.prototype, 'toJwt').mockResolvedValue('mock-jwt-token')
    jest.spyOn(IngressClient.prototype, 'listIngress').mockResolvedValue([])
    jest.spyOn(IngressClient.prototype, 'createIngress').mockResolvedValue(undefined as any)
    jest.spyOn(WebhookReceiver.prototype, 'receive').mockResolvedValue(undefined as any)

    livekitComponent = await createLivekitComponent({
      config: {
        requireString: jest.fn().mockResolvedValue('test'),
        getString: jest.fn().mockImplementation((key: string) => {
          if (key === 'ALLOW_LOCAL_PREVIEW') return 'true'
          return ''
        }),
        getNumber: jest.fn().mockReturnValue(0),
        requireNumber: jest.fn().mockResolvedValue(0)
      },
      logs: {
        getLogger: jest.fn().mockReturnValue({
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        })
      }
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and two appendToRoomMetadataArray calls run concurrently on the same room', () => {
    beforeEach(() => {
      let callCount = 0
      listRoomsSpy.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          // First call: room has empty presenters
          return [new Room({ name: 'test-room', metadata: JSON.stringify({ presenters: [] }) })]
        }
        // Subsequent calls: return metadata that includes what previous writes committed
        // The lock ensures the second append reads AFTER the first write completes
        return [new Room({ name: 'test-room', metadata: JSON.stringify({ presenters: ['0xfirst'] }) })]
      })

      updateRoomMetadataSpy.mockResolvedValue(undefined)
    })

    it('should serialize the writes so both values are preserved', async () => {
      await Promise.all([
        livekitComponent.appendToRoomMetadataArray('test-room', 'presenters', '0xfirst'),
        livekitComponent.appendToRoomMetadataArray('test-room', 'presenters', '0xsecond')
      ])

      expect(updateRoomMetadataSpy).toHaveBeenCalledTimes(2)

      // First write: appends '0xfirst' to empty array
      const firstWrite = JSON.parse(updateRoomMetadataSpy.mock.calls[0][1])
      expect(firstWrite.presenters).toContain('0xfirst')

      // Second write: reads the result of the first write, then appends '0xsecond'
      const secondWrite = JSON.parse(updateRoomMetadataSpy.mock.calls[1][1])
      expect(secondWrite.presenters).toContain('0xfirst')
      expect(secondWrite.presenters).toContain('0xsecond')
    })
  })

  describe('and appendToRoomMetadataArray and updateRoomMetadata run concurrently', () => {
    beforeEach(() => {
      let callCount = 0
      listRoomsSpy.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return [new Room({ name: 'test-room', metadata: JSON.stringify({ presenters: ['0xadmin'] }) })]
        }
        // After presenter write, return updated metadata
        return [
          new Room({
            name: 'test-room',
            metadata: JSON.stringify({ presenters: ['0xadmin', '0xstreamer'] })
          })
        ]
      })

      updateRoomMetadataSpy.mockResolvedValue(undefined)
    })

    it('should preserve both presenters and banned addresses', async () => {
      await Promise.all([
        livekitComponent.appendToRoomMetadataArray('test-room', 'presenters', '0xstreamer'),
        livekitComponent.updateRoomMetadata('test-room', { bannedAddresses: ['0xbanned'] })
      ])

      expect(updateRoomMetadataSpy).toHaveBeenCalledTimes(2)

      // Second write should merge bans with the presenters from the first write
      const secondWrite = JSON.parse(updateRoomMetadataSpy.mock.calls[1][1])
      expect(secondWrite.bannedAddresses).toEqual(['0xbanned'])
      expect(secondWrite.presenters).toBeDefined()
    })
  })

  describe('and writes target different rooms', () => {
    beforeEach(() => {
      listRoomsSpy.mockImplementation(async (names: string[]) => {
        const roomName = names[0]
        return [new Room({ name: roomName, metadata: JSON.stringify({}) })]
      })

      updateRoomMetadataSpy.mockResolvedValue(undefined)
    })

    it('should not block each other', async () => {
      const startTime = Date.now()

      await Promise.all([
        livekitComponent.appendToRoomMetadataArray('room-a', 'presenters', '0xone'),
        livekitComponent.appendToRoomMetadataArray('room-b', 'presenters', '0xtwo')
      ])

      // Both should complete quickly (not serialized)
      expect(Date.now() - startTime).toBeLessThan(1000)
      expect(updateRoomMetadataSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('and a write fails', () => {
    beforeEach(() => {
      listRoomsSpy.mockResolvedValue([new Room({ name: 'test-room', metadata: JSON.stringify({}) })])
      updateRoomMetadataSpy
        .mockRejectedValueOnce(new Error('LiveKit API error'))
        .mockResolvedValueOnce(undefined)
    })

    it('should not block subsequent writes to the same room', async () => {
      await expect(
        livekitComponent.appendToRoomMetadataArray('test-room', 'presenters', '0xfirst')
      ).rejects.toThrow('LiveKit API error')

      // Second write should succeed — lock should be released after failure
      await livekitComponent.appendToRoomMetadataArray('test-room', 'presenters', '0xsecond')

      expect(updateRoomMetadataSpy).toHaveBeenCalledTimes(2)
    })
  })
})
