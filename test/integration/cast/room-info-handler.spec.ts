import { test } from '../../components'
import { makeRequest } from '../../utils'

test('Cast: Room Info Handler', function ({ components, spyComponents }) {
  let validRoomId: string

  beforeEach(() => {
    validRoomId = 'place:test-123'
  })

  it('should return room info for active room', async () => {
    const mockRoom = {
      name: validRoomId,
      numParticipants: 3,
      creationTime: Date.now(),
      metadata: JSON.stringify({ description: 'Test room' }),
      participants: [
        {
          identity: 'stream:place:test-123:12345',
          metadata: JSON.stringify({ role: 'streamer' }),
          tracks: [
            { type: 'video', muted: false },
            { type: 'audio', muted: false }
          ]
        },
        {
          identity: 'watcher:place:test-123:67890',
          metadata: JSON.stringify({ role: 'watcher' }),
          tracks: []
        }
      ]
    }

    spyComponents.livekit.getRoomInfo.mockResolvedValue(mockRoom as any)

    const response = await makeRequest(components.localFetch, `/cast/room-info/${validRoomId}`, { method: 'GET' })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.roomId).toBe(validRoomId)
    expect(body.participantCount).toBeGreaterThanOrEqual(0)
    expect(spyComponents.livekit.getRoomInfo).toHaveBeenCalledWith(validRoomId)
  })

  it('should return info for empty room', async () => {
    const mockRoom = {
      name: validRoomId,
      numParticipants: 0,
      creationTime: Date.now(),
      metadata: '{}',
      participants: []
    }

    spyComponents.livekit.getRoomInfo.mockResolvedValue(mockRoom as any)

    const response = await makeRequest(components.localFetch, `/cast/room-info/${validRoomId}`, { method: 'GET' })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.participantCount).toBe(0)
  })

  it('should handle room with invalid participant metadata', async () => {
    const mockRoom = {
      name: validRoomId,
      numParticipants: 1,
      creationTime: Date.now(),
      metadata: null,
      participants: [
        {
          identity: 'participant:123',
          metadata: 'invalid-json{',
          tracks: []
        }
      ]
    }

    spyComponents.livekit.getRoomInfo.mockResolvedValue(mockRoom as any)

    const response = await makeRequest(components.localFetch, `/cast/room-info/${validRoomId}`, { method: 'GET' })

    expect(response.status).toBe(200)
  })

  it('should return 404 for non-existent room', async () => {
    spyComponents.livekit.getRoomInfo.mockResolvedValue(null)

    const response = await makeRequest(components.localFetch, `/cast/room-info/non-existent-room`, { method: 'GET' })

    expect(response.status).toBe(404)
  })

  it('should handle livekit failures gracefully', async () => {
    spyComponents.livekit.getRoomInfo.mockRejectedValue(new Error('LiveKit connection error'))

    const response = await makeRequest(components.localFetch, `/cast/room-info/${validRoomId}`, { method: 'GET' })

    expect([400, 500]).toContain(response.status) // Livekit errors can return 400 or 500
  })
})
