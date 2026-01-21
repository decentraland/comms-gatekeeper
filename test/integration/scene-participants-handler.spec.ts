import { ParticipantInfo } from 'livekit-server-sdk'
import { Entity, EntityType } from '@dcl/schemas'
import { test } from '../components'

test('GET /scene-participants', ({ components, stubComponents, spyComponents }) => {
  const mockParticipants = [
    { identity: '0x1234567890abcdef1234567890abcdef12345678', metadata: '{}' },
    { identity: '0xabcdef1234567890abcdef1234567890abcdef12', metadata: '{}' }
  ] as unknown as ParticipantInfo[]

  describe('when requesting participants for a scene room', () => {
    const pointer = '10,20'
    const realmName = 'main'
    const sceneId = 'bafkreiabc123456789scene'
    let mockEntity: Entity

    beforeEach(() => {
      mockEntity = {
        version: 'v3',
        id: sceneId,
        type: EntityType.SCENE,
        pointers: [pointer],
        timestamp: Date.now(),
        content: []
      }

      spyComponents.contentClient.fetchEntitiesByPointers.mockResolvedValue([mockEntity])
      stubComponents.livekit.getSceneRoomName.returns(`scene-${realmName}:${sceneId}`)
    })

    afterEach(() => {
      spyComponents.contentClient.fetchEntitiesByPointers.mockReset()
    })

    describe('when room exists with participants', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves({ name: `scene-${realmName}:${sceneId}` } as any)
        stubComponents.livekit.listRoomParticipants.resolves(mockParticipants)
      })

      it('should return list of participant addresses', async () => {
        const response = await components.localFetch.fetch(
          `/scene-participants?pointer=${pointer}&realm_name=${realmName}`
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
        expect(spyComponents.contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([pointer])
        expect(stubComponents.livekit.getSceneRoomName.calledWith(realmName, sceneId)).toBe(true)
        expect(stubComponents.livekit.listRoomParticipants.called).toBe(true)
      })
    })

    describe('when room does not exist', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves(null)
      })

      it('should return empty addresses array', async () => {
        const response = await components.localFetch.fetch(
          `/scene-participants?pointer=${pointer}&realm_name=${realmName}`
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
        stubComponents.livekit.getRoomInfo.resolves({ name: `scene-${realmName}:${sceneId}` } as any)
        stubComponents.livekit.listRoomParticipants.resolves([])
      })

      it('should return empty addresses array', async () => {
        const response = await components.localFetch.fetch(
          `/scene-participants?pointer=${pointer}&realm_name=${realmName}`
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

    describe('when no scene is found for the pointer', () => {
      beforeEach(() => {
        spyComponents.contentClient.fetchEntitiesByPointers.mockResolvedValue([])
      })

      it('should return 404 error', async () => {
        const response = await components.localFetch.fetch(
          `/scene-participants?pointer=${pointer}&realm_name=${realmName}`
        )

        expect(response.status).toBe(404)

        const body = await response.json()
        expect(body.error).toContain(`No scene found for pointer: ${pointer}`)
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
        const response = await components.localFetch.fetch(`/scene-participants?world_name=${worldName}`)

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
        expect(stubComponents.livekit.getWorldRoomName.calledWith(worldName)).toBe(true)
        expect(stubComponents.livekit.listRoomParticipants.called).toBe(true)
      })
    })

    describe('when room does not exist', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves(null)
      })

      it('should return empty addresses array', async () => {
        const response = await components.localFetch.fetch(`/scene-participants?world_name=${worldName}`)

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
    it('should return 400 error when no parameters provided', async () => {
      const response = await components.localFetch.fetch('/scene-participants')

      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toContain('is required')
    })

    it('should return 400 error when only pointer provided without realm_name', async () => {
      const response = await components.localFetch.fetch('/scene-participants?pointer=10,20')

      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toContain('is required')
    })
  })

  describe('when using realm_name as world name', () => {
    const worldName = 'mycoolworld.dcl.eth'

    beforeEach(() => {
      stubComponents.livekit.getWorldRoomName.returns(`world-prod-scene-room-${worldName}`)
    })

    describe('when room exists with participants', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves({ name: `world-prod-scene-room-${worldName}` } as any)
        stubComponents.livekit.listRoomParticipants.resolves(mockParticipants)
      })

      it('should treat realm_name as world name and return participants', async () => {
        const response = await components.localFetch.fetch(`/scene-participants?realm_name=${worldName}`)

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
        expect(stubComponents.livekit.getWorldRoomName.calledWith(worldName)).toBe(true)
        expect(stubComponents.livekit.listRoomParticipants.called).toBe(true)
      })
    })

    describe('when room does not exist', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.resolves(null)
      })

      it('should return empty addresses array', async () => {
        const response = await components.localFetch.fetch(`/scene-participants?realm_name=${worldName}`)

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
})
