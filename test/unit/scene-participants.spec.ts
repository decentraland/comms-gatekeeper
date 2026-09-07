import { Entity } from '@dcl/schemas'
import { ParticipantInfo } from 'livekit-server-sdk'
import { createSceneParticipantsComponent, ISceneParticipantsComponent } from '../../src/adapters/scene-participants'
import { createPresenceMapComponent, IPresenceMapComponent } from '../../src/logic/presence-map'
import { WorldScene } from '../../src/types/worlds.type'
import { decodeParcelChangesFixture, readFixtureJson } from '../fixtures/iteration-2/loader'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createContentClientMockedComponent } from '../mocks/content-client-mock'
import { createFetchMockedComponent } from '../mocks/fetch-mock'
import { createLivekitMockedComponent } from '../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createMetricsMockedComponent } from '../mocks/metrics-mock'
import { createNatsMockedComponent } from '../mocks/nats-mock'
import { createPlacesMockedComponent, createMockedPlace, createMockedWorldPlace } from '../mocks/places-mock'
import { createPresenceMapMockedComponent } from '../mocks/presence-map-mock'
import { createSceneBanManagerMockedComponent } from '../mocks/scene-ban-manager-mock'

/**
 * The C3 resolution cases, driven by the contract pack:
 * `scene-participants/{land,world,world-pointer,banned-filtered}.json` for the requests and the
 * expected bodies, and `parcel_changes/01-snapshot.bin` for the presence state they all assume
 * (`replay.json` steps[0].map).
 */
const LAND = readFixtureJson<any>('scene-participants/land.json')
const WORLD = readFixtureJson<any>('scene-participants/world.json')
const WORLD_POINTER = readFixtureJson<any>('scene-participants/world-pointer.json')
const BANNED = readFixtureJson<any>('scene-participants/banned-filtered.json')

/** `GET /scene-participants?a=1&b=2` -> `{ a: '1', b: '2' }`. */
function paramsOf(request: string): { pointer?: string | null; realmName?: string | null } {
  const query = new URL(`http://example.com${request.replace('GET ', '')}`).searchParams
  return { pointer: query.get('pointer'), realmName: query.get('realm_name') }
}

const LIVEKIT_PARTICIPANTS = [
  { identity: '0x00000000000000000000000000000000000000aa', metadata: '{}' }
] as unknown as ParticipantInfo[]

describe('scene-participants component', () => {
  let livekit: ReturnType<typeof createLivekitMockedComponent>
  let contentClient: ReturnType<typeof createContentClientMockedComponent>
  let worlds: any
  let places: ReturnType<typeof createPlacesMockedComponent>
  let sceneBanManager: ReturnType<typeof createSceneBanManagerMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let presenceMap: IPresenceMapComponent
  let logger: any
  let component: ISceneParticipantsComponent

  /** A presence map holding exactly the state every C3 case assumes. */
  async function primedPresenceMap(): Promise<IPresenceMapComponent> {
    const map = await createPresenceMapComponent({
      config: createConfigMockedComponent({ getString: jest.fn().mockResolvedValue(undefined) }),
      logs: createLoggerMockedComponent({}),
      metrics: createMetricsMockedComponent({}),
      nats: createNatsMockedComponent({}),
      fetch: createFetchMockedComponent()
    })
    map.applyBatch(decodeParcelChangesFixture('01-snapshot.bin'))
    return map
  }

  async function build(settings: Record<string, string | undefined> = {}): Promise<ISceneParticipantsComponent> {
    const config = createConfigMockedComponent({
      getString: jest.fn().mockImplementation((key: string) => Promise.resolve(settings[key]))
    })
    const logs = createLoggerMockedComponent({})

    component = await createSceneParticipantsComponent({
      config,
      livekit,
      contentClient,
      worlds,
      places,
      sceneBanManager,
      presenceMap,
      metrics,
      logs
    })
    logger = logs.getLogger.mock.results[0].value

    return component
  }

  beforeEach(async () => {
    livekit = createLivekitMockedComponent({
      getSceneRoomName: jest.fn().mockReturnValue('scene-room'),
      getWorldRoomName: jest.fn().mockReturnValue('world-room'),
      getWorldSceneRoomName: jest.fn().mockReturnValue('world-scene-room'),
      getRoomInfo: jest.fn().mockResolvedValue({ name: 'scene-room' } as any),
      listRoomParticipants: jest.fn().mockResolvedValue(LIVEKIT_PARTICIPANTS)
    })
    contentClient = createContentClientMockedComponent({
      fetchEntitiesByPointers: jest.fn().mockResolvedValue(LAND.catalyst.returns as Entity[])
    })
    worlds = { fetchWorldSceneByPointer: jest.fn().mockResolvedValue(undefined) }
    places = createPlacesMockedComponent({
      getPlaceByParcel: jest.fn().mockResolvedValue(createMockedPlace({ id: 'land-place' })),
      getWorldScenePlaceByEntityId: jest.fn().mockResolvedValue(createMockedWorldPlace({ id: 'world-scene-place' })),
      getWorldByName: jest.fn().mockResolvedValue(createMockedWorldPlace({ id: 'world-place' }))
    })
    sceneBanManager = createSceneBanManagerMockedComponent({ listBannedAddresses: jest.fn().mockResolvedValue([]) })
    metrics = createMetricsMockedComponent({})
    presenceMap = await primedPresenceMap()
  })

  describe('when LIVEKIT_PRESENCE_FALLBACK is not configured', () => {
    beforeEach(async () => {
      await build()
    })

    it('should answer from LiveKit, which is what this service does today', async () => {
      const addresses = await component.getParticipantAddresses(paramsOf(LAND.request))

      expect(addresses).toEqual(['0x00000000000000000000000000000000000000aa'])
      expect(livekit.listRoomParticipants).toHaveBeenCalled()
    })

    it('should not consult the presence map at all', async () => {
      const spy = jest.spyOn(presenceMap, 'getAddressesInParcels')

      await component.getParticipantAddresses(paramsOf(LAND.request))

      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('when LIVEKIT_PRESENCE_FALLBACK is false', () => {
    beforeEach(async () => {
      await build({ LIVEKIT_PRESENCE_FALLBACK: 'false' })
    })

    it('should answer the land case from the presence map, never from LiveKit', async () => {
      const addresses = await component.getParticipantAddresses(paramsOf(LAND.request))

      expect(addresses).toEqual(LAND.body.data.addresses)
      expect(livekit.listRoomParticipants).not.toHaveBeenCalled()
    })

    it('should resolve the land pointer through the catalyst', async () => {
      await component.getParticipantAddresses(paramsOf(LAND.request))

      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith(LAND.catalyst.fetchEntitiesByPointers)
    })

    it('should answer the whole world for a mixed-case realm_name with no pointer', async () => {
      const addresses = await component.getParticipantAddresses(paramsOf(WORLD.request))

      expect(addresses).toEqual(WORLD.body.data.addresses)
      expect(worlds.fetchWorldSceneByPointer).not.toHaveBeenCalled()
    })

    describe.each(WORLD_POINTER.cases.map((testCase: any) => [testCase.request, testCase] as const))(
      'and the request is "%s"',
      (_request, testCase: any) => {
        beforeEach(() => {
          const scene = testCase.worlds.returns
          worlds.fetchWorldSceneByPointer.mockResolvedValue({
            worldName: testCase.worlds.fetchWorldSceneByPointer.worldName,
            deployer: '0x0000000000000000000000000000000000000000',
            entityId: scene.id,
            parcels: scene.metadata.scene.parcels
          } as WorldScene)
        })

        it('should answer with the peers standing on that world scene', async () => {
          const addresses = await component.getParticipantAddresses(paramsOf(testCase.request))

          expect(addresses).toEqual(testCase.body.data.addresses)
          expect(worlds.fetchWorldSceneByPointer).toHaveBeenCalledWith(
            testCase.worlds.fetchWorldSceneByPointer.worldName,
            testCase.worlds.fetchWorldSceneByPointer.pointer
          )
        })
      }
    )

    describe('and the scene has banned addresses', () => {
      beforeEach(() => {
        sceneBanManager.listBannedAddresses.mockResolvedValue(BANNED.gatekeeperBans)
      })

      it('should never list a banned wallet, even while it is still standing there', async () => {
        const addresses = await component.getParticipantAddresses(paramsOf(BANNED.request))

        expect(addresses).toEqual(BANNED.body.data.addresses)
        expect(sceneBanManager.listBannedAddresses).toHaveBeenCalledWith('land-place')
      })

      it('should match the ban case-insensitively', async () => {
        sceneBanManager.listBannedAddresses.mockResolvedValue(
          BANNED.gatekeeperBans.map((address: string) => address.toUpperCase())
        )

        const addresses = await component.getParticipantAddresses(paramsOf(BANNED.request))

        expect(addresses).toEqual(BANNED.body.data.addresses)
      })
    })

    describe('and the ban lookup fails', () => {
      beforeEach(() => {
        places.getPlaceByParcel.mockRejectedValue(new Error('places is down'))
      })

      it('should still answer, because an unfiltered answer is what LiveKit serves today', async () => {
        const addresses = await component.getParticipantAddresses(paramsOf(LAND.request))

        expect(addresses).toEqual(LAND.body.data.addresses)
        expect(logger.warn).toHaveBeenCalled()
      })
    })

    describe('and no scene is deployed on the requested pointer', () => {
      beforeEach(() => {
        contentClient.fetchEntitiesByPointers.mockResolvedValue([])
      })

      it('should report it as not found', async () => {
        await expect(component.getParticipantAddresses(paramsOf(LAND.request))).rejects.toThrow(
          'No scene found for pointer: -1,0'
        )
      })
    })

    describe('and the world scene does not exist', () => {
      beforeEach(() => {
        worlds.fetchWorldSceneByPointer.mockResolvedValue(undefined)
      })

      it('should report it as not found', async () => {
        await expect(component.getParticipantAddresses(paramsOf(WORLD_POINTER.cases[0].request))).rejects.toThrow(
          /No scene found for world/
        )
      })
    })

    describe('and the presence map has not been primed', () => {
      beforeEach(async () => {
        presenceMap = createPresenceMapMockedComponent({ isReady: jest.fn().mockReturnValue(false) })
        await build({ LIVEKIT_PRESENCE_FALLBACK: 'false' })
      })

      it('should fall back to LiveKit rather than report an empty scene', async () => {
        const addresses = await component.getParticipantAddresses(paramsOf(LAND.request))

        expect(addresses).toEqual(['0x00000000000000000000000000000000000000aa'])
        expect(logger.warn).toHaveBeenCalled()
      })
    })

    it('should reject a request that names neither a pointer nor a world', async () => {
      await expect(component.getParticipantAddresses({ pointer: null, realmName: 'main' })).rejects.toThrow(
        'Either pointer with realm_name or a world realm_name must be provided'
      )
    })
  })

  describe('when SHADOW_COMPARE_PRESENCE is true', () => {
    beforeEach(async () => {
      await build({ SHADOW_COMPARE_PRESENCE: 'true' })
    })

    it('should still serve the LiveKit answer', async () => {
      const addresses = await component.getParticipantAddresses(paramsOf(LAND.request))

      expect(addresses).toEqual(['0x00000000000000000000000000000000000000aa'])
    })

    it('should count the symmetric difference of the two answers under kind=land', async () => {
      await component.getParticipantAddresses(paramsOf(LAND.request))

      // LiveKit says 0x…aa, the map says 0x…01 and 0x…04: three addresses differ.
      expect(metrics.increment).toHaveBeenCalledWith('presence_shadow_diff', { kind: 'land' }, 3)
    })

    it('should count a world difference under kind=world', async () => {
      livekit.listRoomParticipants.mockResolvedValue([])

      await component.getParticipantAddresses(paramsOf(WORLD.request))

      expect(metrics.increment).toHaveBeenCalledWith('presence_shadow_diff', { kind: 'world' }, 1)
    })

    it('should never log or count an address', async () => {
      await component.getParticipantAddresses(paramsOf(LAND.request))

      const logged = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.debug.mock.calls])
      for (const address of [...LAND.body.data.addresses, '0x00000000000000000000000000000000000000aa']) {
        expect(logged).not.toContain(address)
      }
      for (const call of metrics.increment.mock.calls) {
        expect(JSON.stringify(call)).not.toContain('0x')
      }
    })

    it('should not count anything when both sources agree', async () => {
      livekit.listRoomParticipants.mockResolvedValue(
        LAND.body.data.addresses.map((address: string) => ({ identity: address, metadata: '{}' }))
      )

      await component.getParticipantAddresses(paramsOf(LAND.request))

      expect(metrics.increment).not.toHaveBeenCalledWith('presence_shadow_diff', expect.anything(), expect.anything())
    })

    it('should not let a failing shadow lookup break the served answer', async () => {
      contentClient.fetchEntitiesByPointers.mockRejectedValue(new Error('catalyst is down'))

      await expect(component.getParticipantAddresses(paramsOf(WORLD.request))).resolves.toEqual([
        '0x00000000000000000000000000000000000000aa'
      ])
    })

    describe('and the presence map has not been primed', () => {
      beforeEach(async () => {
        presenceMap = createPresenceMapMockedComponent({ isReady: jest.fn().mockReturnValue(false) })
        await build({ SHADOW_COMPARE_PRESENCE: 'true' })
      })

      it('should skip the comparison instead of reporting every peer as a difference', async () => {
        await component.getParticipantAddresses(paramsOf(LAND.request))

        expect(metrics.increment).not.toHaveBeenCalledWith('presence_shadow_diff', expect.anything(), expect.anything())
      })
    })
  })
})
