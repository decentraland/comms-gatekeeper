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

  describe('when request is missing required parameters', () => {
    it('should return 400 error when no parameters provided', async () => {
      const response = await components.localFetch.fetch('/scene-participants')

      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toContain('Either pointer or realm_name must be provided')
    })
  })

  describe('when using default realm_name', () => {
    const pointer = '15,25'
    const sceneId = 'bafkreidefault123scene'
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
      stubComponents.livekit.getSceneRoomName.returns(`scene-main:${sceneId}`)
      stubComponents.livekit.getRoomInfo.resolves({ name: `scene-main:${sceneId}` } as any)
      stubComponents.livekit.listRoomParticipants.resolves([])
    })

    afterEach(() => {
      spyComponents.contentClient.fetchEntitiesByPointers.mockReset()
    })

    it('should use "main" as default realm_name when only pointer is provided', async () => {
      const response = await components.localFetch.fetch(`/scene-participants?pointer=${pointer}`)

      expect(response.status).toBe(200)
      expect(spyComponents.contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([pointer])
      expect(stubComponents.livekit.getSceneRoomName.calledWith('main', sceneId)).toBe(true)
    })
  })

  describe('when using realm_name as world name', () => {
    const worldName = 'mycoolworld.dcl.eth'
    const worldSceneId = 'bafkreiworldscene123'
    const pointer = '0,0'

    describe('when realm_name ends with .dcl.eth', () => {
      describe('and pointer is provided', () => {
        beforeEach(() => {
          spyComponents.worlds.fetchWorldSceneByPointer.mockResolvedValue({
            worldName: worldName.toLowerCase(),
            deployer: '0x1234567890abcdef1234567890abcdef12345678',
            entityId: worldSceneId,
            parcels: [pointer]
          })
          stubComponents.livekit.getWorldSceneRoomName.returns(
            `world-prod-scene-room-${worldName}-${worldSceneId}`
          )
          stubComponents.livekit.getRoomInfo.resolves({
            name: `world-prod-scene-room-${worldName}-${worldSceneId}`
          } as any)
          stubComponents.livekit.listRoomParticipants.resolves(mockParticipants)
        })

        afterEach(() => {
          spyComponents.worlds.fetchWorldSceneByPointer.mockReset()
        })

        it('should fetch scene from world content server and return participants', async () => {
          const response = await components.localFetch.fetch(
            `/scene-participants?pointer=${pointer}&realm_name=${worldName}`
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
          expect(spyComponents.worlds.fetchWorldSceneByPointer).toHaveBeenCalledWith(worldName, pointer)
          expect(stubComponents.livekit.getWorldSceneRoomName.calledWith(worldName, worldSceneId)).toBe(true)
          expect(stubComponents.livekit.listRoomParticipants.called).toBe(true)
        })

        describe('and no scene is found for the pointer', () => {
          beforeEach(() => {
            spyComponents.worlds.fetchWorldSceneByPointer.mockResolvedValue(undefined)
          })

          it('should return 404 error', async () => {
            const response = await components.localFetch.fetch(
              `/scene-participants?pointer=${pointer}&realm_name=${worldName}`
            )

            expect(response.status).toBe(404)

            const body = await response.json()
            expect(body.error).toContain(`No scene found for world ${worldName} at pointer: ${pointer}`)
          })
        })
      })

      describe('and only realm_name is provided (world room)', () => {
        beforeEach(() => {
          stubComponents.livekit.getWorldRoomName.returns(`world-prod-scene-room-${worldName}`)
          stubComponents.livekit.getRoomInfo.resolves({
            name: `world-prod-scene-room-${worldName}`
          } as any)
          stubComponents.livekit.listRoomParticipants.resolves(mockParticipants)
        })

        it('should get the world room and return participants', async () => {
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

      describe('and room does not exist', () => {
        beforeEach(() => {
          stubComponents.livekit.getWorldRoomName.returns(`world-prod-scene-room-${worldName}`)
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

    describe('when realm_name ends with .eth but not .dcl.eth', () => {
      const ethWorldName = 'mycoolworld.eth'

      beforeEach(() => {
        stubComponents.livekit.getWorldRoomName.returns(`world-prod-scene-room-${ethWorldName}`)
        stubComponents.livekit.getRoomInfo.resolves({
          name: `world-prod-scene-room-${ethWorldName}`
        } as any)
        stubComponents.livekit.listRoomParticipants.resolves(mockParticipants)
      })

      it('should accept .eth realm_name as a world name', async () => {
        const response = await components.localFetch.fetch(`/scene-participants?realm_name=${ethWorldName}`)

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
        expect(stubComponents.livekit.getWorldRoomName.calledWith(ethWorldName)).toBe(true)
      })
    })

    describe('when realm_name does not end with .eth and no pointer is provided', () => {
      it('should return 400 error', async () => {
        const response = await components.localFetch.fetch('/scene-participants?realm_name=invalid-world')

        expect(response.status).toBe(400)

        const body = await response.json()
        expect(body.error).toContain('Either pointer with realm_name or a world realm_name must be provided')
      })
    })
  })
})
