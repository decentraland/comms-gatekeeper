import { ParticipantInfo } from 'livekit-server-sdk'
import { Entity, EntityType } from '@dcl/schemas'
import { test } from '../components'
import { decodeParcelChangesFixture, readFixtureJson } from '../fixtures/iteration-2/loader'

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
      stubComponents.livekit.getSceneRoomName.mockReturnValue(`scene-${realmName}:${sceneId}`)
    })

    afterEach(() => {
      spyComponents.contentClient.fetchEntitiesByPointers.mockReset()
    })

    describe('when room exists with participants', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.mockResolvedValue({ name: `scene-${realmName}:${sceneId}` } as any)
        stubComponents.livekit.listRoomParticipants.mockResolvedValue(mockParticipants)
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
            addresses: ['0x1234567890abcdef1234567890abcdef12345678', '0xabcdef1234567890abcdef1234567890abcdef12']
          }
        })
        expect(spyComponents.contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([pointer])
        expect(stubComponents.livekit.getSceneRoomName).toHaveBeenCalledWith(realmName, sceneId)
        expect(stubComponents.livekit.listRoomParticipants).toHaveBeenCalled()
      })
    })

    describe('when room does not exist', () => {
      beforeEach(() => {
        stubComponents.livekit.getRoomInfo.mockResolvedValue(null)
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
        stubComponents.livekit.getRoomInfo.mockResolvedValue({ name: `scene-${realmName}:${sceneId}` } as any)
        stubComponents.livekit.listRoomParticipants.mockResolvedValue([])
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
      stubComponents.livekit.getSceneRoomName.mockReturnValue(`scene-main:${sceneId}`)
      stubComponents.livekit.getRoomInfo.mockResolvedValue({ name: `scene-main:${sceneId}` } as any)
      stubComponents.livekit.listRoomParticipants.mockResolvedValue([])
    })

    afterEach(() => {
      spyComponents.contentClient.fetchEntitiesByPointers.mockReset()
    })

    it('should use "main" as default realm_name when only pointer is provided', async () => {
      const response = await components.localFetch.fetch(`/scene-participants?pointer=${pointer}`)

      expect(response.status).toBe(200)
      expect(spyComponents.contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith([pointer])
      expect(stubComponents.livekit.getSceneRoomName).toHaveBeenCalledWith('main', sceneId)
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
          stubComponents.livekit.getWorldSceneRoomName.mockReturnValue(
            `world-prod-scene-room-${worldName}-${worldSceneId}`
          )
          stubComponents.livekit.getRoomInfo.mockResolvedValue({
            name: `world-prod-scene-room-${worldName}-${worldSceneId}`
          } as any)
          stubComponents.livekit.listRoomParticipants.mockResolvedValue(mockParticipants)
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
              addresses: ['0x1234567890abcdef1234567890abcdef12345678', '0xabcdef1234567890abcdef1234567890abcdef12']
            }
          })
          expect(spyComponents.worlds.fetchWorldSceneByPointer).toHaveBeenCalledWith(worldName, pointer)
          expect(stubComponents.livekit.getWorldSceneRoomName).toHaveBeenCalledWith(worldName, worldSceneId)
          expect(stubComponents.livekit.listRoomParticipants).toHaveBeenCalled()
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
          stubComponents.livekit.getWorldRoomName.mockReturnValue(`world-prod-scene-room-${worldName}`)
          stubComponents.livekit.getRoomInfo.mockResolvedValue({
            name: `world-prod-scene-room-${worldName}`
          } as any)
          stubComponents.livekit.listRoomParticipants.mockResolvedValue(mockParticipants)
        })

        it('should get the world room and return participants', async () => {
          const response = await components.localFetch.fetch(`/scene-participants?realm_name=${worldName}`)

          expect(response.status).toBe(200)

          const body = await response.json()
          expect(body).toEqual({
            ok: true,
            data: {
              addresses: ['0x1234567890abcdef1234567890abcdef12345678', '0xabcdef1234567890abcdef1234567890abcdef12']
            }
          })
          expect(stubComponents.livekit.getWorldRoomName).toHaveBeenCalledWith(worldName)
          expect(stubComponents.livekit.listRoomParticipants).toHaveBeenCalled()
        })
      })

      describe('and room does not exist', () => {
        beforeEach(() => {
          stubComponents.livekit.getWorldRoomName.mockReturnValue(`world-prod-scene-room-${worldName}`)
          stubComponents.livekit.getRoomInfo.mockResolvedValue(null)
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
        stubComponents.livekit.getWorldRoomName.mockReturnValue(`world-prod-scene-room-${ethWorldName}`)
        stubComponents.livekit.getRoomInfo.mockResolvedValue({
          name: `world-prod-scene-room-${ethWorldName}`
        } as any)
        stubComponents.livekit.listRoomParticipants.mockResolvedValue(mockParticipants)
      })

      it('should accept .eth realm_name as a world name', async () => {
        const response = await components.localFetch.fetch(`/scene-participants?realm_name=${ethWorldName}`)

        expect(response.status).toBe(200)

        const body = await response.json()
        expect(body).toEqual({
          ok: true,
          data: {
            addresses: ['0x1234567890abcdef1234567890abcdef12345678', '0xabcdef1234567890abcdef1234567890abcdef12']
          }
        })
        expect(stubComponents.livekit.getWorldRoomName).toHaveBeenCalledWith(ethWorldName)
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

/**
 * The C3 path: the answer resolved on Pulse's presence map instead of on LiveKit room
 * membership. `LIVEKIT_PRESENCE_FALLBACK=false` is what flips it, and it is set through
 * `beforeStart` because the component reads the flag once, when it is built.
 *
 * The map is fed the contract pack's own bytes (`01-snapshot.bin`), so the presence state these
 * cases resolve against is exactly the one `parcel_changes/replay.json` pins.
 */
test('GET /scene-participants resolved on the presence map', ({ components, stubComponents, beforeStart }) => {
  const LAND = readFixtureJson<any>('scene-participants/land.json')
  const WORLD = readFixtureJson<any>('scene-participants/world.json')
  const WORLD_POINTER = readFixtureJson<any>('scene-participants/world-pointer.json')
  const BANNED = readFixtureJson<any>('scene-participants/banned-filtered.json')

  const previousEnv = {
    presenceMap: process.env.PRESENCE_MAP_ENABLED,
    livekitFallback: process.env.LIVEKIT_PRESENCE_FALLBACK
  }

  beforeStart(() => {
    process.env.PRESENCE_MAP_ENABLED = 'true'
    process.env.LIVEKIT_PRESENCE_FALLBACK = 'false'
  })

  afterAll(() => {
    // Jest reuses a worker process across spec files, so the flags must not outlive this suite.
    process.env.PRESENCE_MAP_ENABLED = previousEnv.presenceMap
    process.env.LIVEKIT_PRESENCE_FALLBACK = previousEnv.livekitFallback
  })

  beforeEach(() => {
    components.presenceMap.applyBatch(decodeParcelChangesFixture('01-snapshot.bin'))
    stubComponents.places.getPlaceByParcel.mockResolvedValue({ id: 'land-place' } as any)
    stubComponents.places.getWorldByName.mockResolvedValue({ id: 'world-place' } as any)
    stubComponents.places.getWorldScenePlaceByEntityId.mockResolvedValue({ id: 'world-scene-place' } as any)
    stubComponents.sceneBanManager.listBannedAddresses.mockResolvedValue([])
  })

  describe('when asking about a Genesis City pointer', () => {
    beforeEach(() => {
      stubComponents.contentClient.fetchEntitiesByPointers.mockResolvedValue(LAND.catalyst.returns)
    })

    it('should answer with the peers standing on the scene, not with a LiveKit room membership', async () => {
      const response = await components.localFetch.fetch(LAND.request.replace('GET ', ''))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(LAND.body)
      expect(stubComponents.livekit.listRoomParticipants).not.toHaveBeenCalled()
    })

    describe('and one of them is banned from the place', () => {
      beforeEach(() => {
        stubComponents.sceneBanManager.listBannedAddresses.mockResolvedValue(BANNED.gatekeeperBans)
      })

      it('should leave the banned wallet out', async () => {
        const response = await components.localFetch.fetch(BANNED.request.replace('GET ', ''))

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(BANNED.body)
      })
    })
  })

  describe('when asking about a whole world', () => {
    it('should answer case-insensitively on the realm name', async () => {
      const mixedCase = await components.localFetch.fetch(WORLD.request.replace('GET ', ''))
      const lowerCase = await components.localFetch.fetch('/scene-participants?realm_name=cozyfarm.dcl.eth')

      expect(mixedCase.status).toBe(200)
      expect(await mixedCase.json()).toEqual(WORLD.body)
      expect(await lowerCase.json()).toEqual(WORLD.body)
    })
  })

  describe('when asking about one scene of a world', () => {
    beforeEach(() => {
      const testCase = WORLD_POINTER.cases[0]
      stubComponents.worlds.fetchWorldSceneByPointer.mockResolvedValue({
        worldName: testCase.worlds.fetchWorldSceneByPointer.worldName,
        deployer: '0x0000000000000000000000000000000000000000',
        entityId: testCase.worlds.returns.id,
        parcels: testCase.worlds.returns.metadata.scene.parcels
      })
    })

    it('should answer with the peers standing on that scene only', async () => {
      const response = await components.localFetch.fetch(WORLD_POINTER.cases[0].request.replace('GET ', ''))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(WORLD_POINTER.cases[0].body)
    })
  })
})

/**
 * The cold-map answer. `LIVEKIT_PRESENCE_FALLBACK=false` says "do not answer from LiveKit", so
 * before the map is primed this route has nothing to answer with — and says so with the same
 * `503 {"ok":false,"error":"warming"}` body `/hot-scenes` serves, rather than reporting a
 * deserted scene. The map is deliberately never fed here.
 */
test('GET /scene-participants while the presence map is warming', ({ components, beforeStart }) => {
  const previousEnv = {
    presenceMap: process.env.PRESENCE_MAP_ENABLED,
    livekitFallback: process.env.LIVEKIT_PRESENCE_FALLBACK
  }

  beforeStart(() => {
    process.env.PRESENCE_MAP_ENABLED = 'true'
    process.env.LIVEKIT_PRESENCE_FALLBACK = 'false'
  })

  afterAll(() => {
    process.env.PRESENCE_MAP_ENABLED = previousEnv.presenceMap
    process.env.LIVEKIT_PRESENCE_FALLBACK = previousEnv.livekitFallback
  })

  it('should answer 503 warming, exactly as /hot-scenes does', async () => {
    const response = await components.localFetch.fetch('/scene-participants?realm_name=cozyfarm.dcl.eth')

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: 'warming' })
  })
})
