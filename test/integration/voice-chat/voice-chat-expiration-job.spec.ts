import { generateRandomWalletAddresses } from '@dcl/platform-server-commons'
import { test } from '../../components'
import { setUserJoinedAt, setUserStatusUpdatedAt } from '../../db-utils'

test('when expiring private voice chats', async ({ components, spyComponents }) => {
  let VOICE_CHAT_INITIAL_CONNECTION_TTL: number
  let VOICE_CHAT_CONNECTION_INTERRUPTED_TTL: number
  let rooms: {
    roomName: string
    addresses: string[]
  }[] = []

  beforeEach(async () => {
    VOICE_CHAT_INITIAL_CONNECTION_TTL = await components.config.requireNumber('VOICE_CHAT_INITIAL_CONNECTION_TTL')
    VOICE_CHAT_CONNECTION_INTERRUPTED_TTL = await components.config.requireNumber(
      'VOICE_CHAT_CONNECTION_INTERRUPTED_TTL'
    )
    spyComponents.livekit.deleteRoom.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    await Promise.all(
      rooms.map(async (room) =>
        components.voiceDB.deletePrivateVoiceChat(room.roomName, room.addresses[0]).catch(() => {
          // Ignore errors
        })
      )
    )
  })

  describe('and there are no expired private voice chats', () => {
    beforeEach(async () => {
      rooms = [
        {
          roomName: 'room-123',
          addresses: generateRandomWalletAddresses(2)
        },
        {
          roomName: 'room-456',
          addresses: generateRandomWalletAddresses(2)
        }
      ]

      // Create the rooms and join the users to them
      for (const room of rooms) {
        await components.voiceDB.createVoiceChatRoom(room.roomName, room.addresses)
        for (const address of room.addresses) {
          await components.voiceDB.joinUserToRoom(address, room.roomName)
        }
      }
    })

    it('should not delete any private voice chats nor delete any LiveKit rooms', async () => {
      await components.voice.expirePrivateVoiceChats()

      for (const room of rooms) {
        const users = await components.voiceDB.getUsersInRoom(room.roomName)
        expect(users.map((user) => user.address)).toEqual(expect.arrayContaining(room.addresses))
      }

      await expect(spyComponents.livekit.deleteRoom).not.toHaveBeenCalled()
    })
  })

  describe('and there are expired private voice chats due to initial connection timeout', () => {
    beforeEach(async () => {
      rooms = [
        {
          roomName: 'room-123',
          addresses: generateRandomWalletAddresses(2)
        },
        {
          roomName: 'room-456',
          addresses: generateRandomWalletAddresses(2)
        }
      ]

      // Create the first room and join the users to it
      await components.voiceDB.createVoiceChatRoom(rooms[0].roomName, rooms[0].addresses)
      for (const address of rooms[0].addresses) {
        await components.voiceDB.joinUserToRoom(address, rooms[0].roomName)
      }

      // Create the second room and join only the first user to it
      await components.voiceDB.createVoiceChatRoom(rooms[1].roomName, rooms[1].addresses)
      await components.voiceDB.joinUserToRoom(rooms[1].addresses[0], rooms[1].roomName)

      // Set the second user as not for longer than the initial connection timeout
      await setUserJoinedAt(
        components.database,
        rooms[1].addresses[1],
        rooms[1].roomName,
        Date.now() - VOICE_CHAT_INITIAL_CONNECTION_TTL - 1
      )
    })

    it('should delete the expired private voice chats and delete the rooms from LiveKit', async () => {
      await components.voice.expirePrivateVoiceChats()

      const usersInFirstRoom = await components.voiceDB.getUsersInRoom(rooms[0].roomName)
      expect(usersInFirstRoom.map((user) => user.address)).toEqual(rooms[0].addresses)
      await expect(spyComponents.livekit.deleteRoom).not.toHaveBeenCalledWith(rooms[0].roomName)

      const usersInSecondRoom = await components.voiceDB.getUsersInRoom(rooms[1].roomName)
      expect(usersInSecondRoom.map((user) => user.address)).toEqual([])

      await expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(rooms[1].roomName)
    })
  })

  describe('and there are expired private voice chats due to connection interruption', () => {
    beforeEach(async () => {
      rooms = [
        {
          roomName: 'room-123',
          addresses: generateRandomWalletAddresses(2)
        },
        {
          roomName: 'room-456',
          addresses: generateRandomWalletAddresses(2)
        }
      ]

      // Create the rooms and join the users to them
      for (const room of rooms) {
        await components.voiceDB.createVoiceChatRoom(room.roomName, room.addresses)
        for (const address of room.addresses) {
          await components.voiceDB.joinUserToRoom(address, room.roomName)
        }
      }

      // Set the first user as connection interrupted for longer than the connection interrupted timeout
      await components.voiceDB.updateUserStatusAsConnectionInterrupted(rooms[0].addresses[0], rooms[0].roomName)
      await setUserStatusUpdatedAt(
        components.database,
        rooms[0].addresses[0],
        rooms[0].roomName,
        Date.now() - VOICE_CHAT_CONNECTION_INTERRUPTED_TTL - 1
      )
    })

    it('should delete the expired private voice chats and delete the rooms from LiveKit', async () => {
      await components.voice.expirePrivateVoiceChats()

      const usersInFirstRoom = await components.voiceDB.getUsersInRoom(rooms[0].roomName)
      expect(usersInFirstRoom.map((user) => user.address)).toEqual([])
      await expect(spyComponents.livekit.deleteRoom).toHaveBeenCalledWith(rooms[0].roomName)

      const usersInSecondRoom = await components.voiceDB.getUsersInRoom(rooms[1].roomName)
      expect(usersInSecondRoom.map((user) => user.address)).toEqual(rooms[1].addresses)
      await expect(spyComponents.livekit.deleteRoom).not.toHaveBeenCalledWith(rooms[1].roomName)
    })
  })

  describe('and there are expired private voice chats due to disconnection', () => {
    beforeEach(async () => {
      rooms = [
        {
          roomName: 'room-123',
          addresses: generateRandomWalletAddresses(2)
        },
        {
          roomName: 'room-456',
          addresses: generateRandomWalletAddresses(2)
        }
      ]

      // Create the rooms and join the users to them
      for (const room of rooms) {
        await components.voiceDB.createVoiceChatRoom(room.roomName, room.addresses)
        for (const address of room.addresses) {
          await components.voiceDB.joinUserToRoom(address, room.roomName)
        }
      }

      await components.voiceDB.updateUserStatusAsDisconnected(rooms[0].addresses[0], rooms[0].roomName)
    })

    it('should delete the expired private voice chats and not delete the rooms from LiveKit', async () => {
      await components.voice.expirePrivateVoiceChats()

      await expect(components.voiceDB.getUsersInRoom(rooms[0].roomName)).resolves.toEqual([])
      await expect(spyComponents.livekit.deleteRoom).not.toHaveBeenCalledWith(rooms[0].roomName)

      const usersInSecondRoom = await components.voiceDB.getUsersInRoom(rooms[1].roomName)
      expect(usersInSecondRoom.map((user) => user.address)).toEqual(rooms[1].addresses)
      await expect(spyComponents.livekit.deleteRoom).not.toHaveBeenCalledWith(rooms[1].roomName)
    })
  })
})
