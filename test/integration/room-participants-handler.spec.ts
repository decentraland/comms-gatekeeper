import { ParticipantInfo } from 'livekit-server-sdk'
import { test } from '../components'

test('GET /room-participants', ({ components, stubComponents }) => {
  const mockParticipants = [
    { identity: '0x1234567890abcdef1234567890abcdef12345678', metadata: '{}' },
    { identity: '0xabcdef1234567890abcdef1234567890abcdef12', metadata: '{}' }
  ] as unknown as ParticipantInfo[]

  describe('when requesting participants for a scene room', () => {
    const pointer = '10,20'
    const realmName = 'main'

    beforeEach(() => {
      stubComponents.livekit.getSceneRoomName.returns(`scene-${realmName}:${pointer}`)
    })

    describe('when room exists with participants', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves({ name: `scene-${realmName}:${pointer}` } as any)
        stubComponents.livekit.listRoomParticipants.resolves(mockParticipants)
      })

      it('should return list of participant addresses', async () => {
        const response = await components.localFetch.fetch(
          `/room-participants?pointer=${pointer}&realm_name=${realmName}`
        )

        expect(response.status).toBe(200)

        const body = await response.json()
        expect(body).toEqual({
          ok: true,
          data: {
            addresses: [
              '0x1234567890abcdef1234567890abcdef12345678',
              '0xabcdef1234567890abcdef1234567890abcdef12'
            ]
          }
        })
        expect(stubComponents.livekit.getSceneRoomName).toHaveBeenCalledWith(realmName, pointer)
        expect(stubComponents.livekit.listRoomParticipants).toHaveBeenCalled()
      })
    })

    describe('when room does not exist', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves(null)
      })

      it('should return empty addresses array', async () => {
        const response = await components.localFetch.fetch(
          `/room-participants?pointer=${pointer}&realm_name=${realmName}`
        )

        expect(response.status).toBe(200)

        const body = await response.json()
        expect(body).toEqual({
          ok: true,
          data: {
            addresses: []
          }
        })
      })
    })

    describe('when room exists but has no participants', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves({ name: `scene-${realmName}:${pointer}` } as any)
        stubComponents.livekit.listRoomParticipants.resolves([])
      })

      it('should return empty addresses array', async () => {
        const response = await components.localFetch.fetch(
          `/room-participants?pointer=${pointer}&realm_name=${realmName}`
        )

        expect(response.status).toBe(200)

        const body = await response.json()
        expect(body).toEqual({
          ok: true,
          data: {
            addresses: []
          }
        })
      })
    })
  })

  describe('when requesting participants for a world room', () => {
    const worldName = 'myworld.dcl.eth'

    beforeEach(() => {
      stubComponents.livekit.getWorldRoomName.returns(`world-prod-scene-room-${worldName}`)
    })

    describe('when room exists with participants', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves({ name: `world-prod-scene-room-${worldName}` } as any)
        stubComponents.livekit.listRoomParticipants.resolves(mockParticipants)
      })

      it('should return list of participant addresses', async () => {
        const response = await components.localFetch.fetch(`/room-participants?world_name=${worldName}`)

        expect(response.status).toBe(200)

        const body = await response.json()
        expect(body).toEqual({
          ok: true,
          data: {
            addresses: [
              '0x1234567890abcdef1234567890abcdef12345678',
              '0xabcdef1234567890abcdef1234567890abcdef12'
            ]
          }
        })
        expect(stubComponents.livekit.getWorldRoomName).toHaveBeenCalledWith(worldName)
        expect(stubComponents.livekit.listRoomParticipants).toHaveBeenCalled()
      })
    })

    describe('when room does not exist', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves(null)
      })

      it('should return empty addresses array', async () => {
        const response = await components.localFetch.fetch(`/room-participants?world_name=${worldName}`)

        expect(response.status).toBe(200)

        const body = await response.json()
        expect(body).toEqual({
          ok: true,
          data: {
            addresses: []
          }
        })
      })
    })
  })

  describe('when request is missing required parameters', () => {
    it('should return 400 error when no pointer or world_name provided', async () => {
      const response = await components.localFetch.fetch('/room-participants')

      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toContain('world_name or (pointer + realm_name) is required')
    })

    it('should return 400 error when only realm_name provided without pointer', async () => {
      const response = await components.localFetch.fetch('/room-participants?realm_name=main')

      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toContain('world_name or (pointer + realm_name) is required')
    })
  })

  describe('when using default realm_name', () => {
    const pointer = '15,25'

    beforeEach(() => {
      stubComponents.livekit.getSceneRoomName.returns(`scene-main:${pointer}`)
      stubComponents.livekit.getRoomInfo.resolves({ name: `scene-main:${pointer}` } as any)
      stubComponents.livekit.listRoomParticipants.resolves([])
    })

    it('should use "main" as default realm_name when not provided', async () => {
      const response = await components.localFetch.fetch(`/room-participants?pointer=${pointer}`)

      expect(response.status).toBe(200)
      expect(stubComponents.livekit.getSceneRoomName).toHaveBeenCalledWith('main', pointer)
    })
  })
})

