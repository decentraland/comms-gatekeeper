import { Entity } from '@dcl/schemas'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createSceneParticipantsComponent, ISceneParticipantsComponent } from '../../src/adapters/scene-participants'
import {
  createPresenceMapComponent,
  IPresenceMapComponent,
  PresenceMapWarmingError
} from '../../src/logic/presence-map'
import { WorldScene } from '../../src/types/worlds.type'
import { decodeParcelChangesFixture, readFixtureJson } from '../fixtures/iteration-2/loader'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createContentClientMockedComponent } from '../mocks/content-client-mock'
import { createFetchMockedComponent } from '../mocks/fetch-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createMetricsMockedComponent } from '../mocks/metrics-mock'
import { createNatsMockedComponent } from '../mocks/nats-mock'
import { createPlacesMockedComponent, createMockedPlace, createMockedWorldPlace } from '../mocks/places-mock'
import { createPresenceMapMockedComponent } from '../mocks/presence-map-mock'
import { createSceneBanManagerMockedComponent } from '../mocks/scene-ban-manager-mock'

const LAND = readFixtureJson<any>('scene-participants/land.json')
const WORLD = readFixtureJson<any>('scene-participants/world.json')
const WORLD_POINTER = readFixtureJson<any>('scene-participants/world-pointer.json')
const BANNED = readFixtureJson<any>('scene-participants/banned-filtered.json')

function paramsOf(request: string): { pointer?: string | null; realmName?: string | null } {
  const query = new URL(`http://example.com${request.replace('GET ', '')}`).searchParams
  return { pointer: query.get('pointer'), realmName: query.get('realm_name') }
}

describe('scene-participants component', () => {
  let contentClient: ReturnType<typeof createContentClientMockedComponent>
  let worlds: { fetchWorldSceneByPointer: jest.Mock }
  let places: ReturnType<typeof createPlacesMockedComponent>
  let sceneBanManager: ReturnType<typeof createSceneBanManagerMockedComponent>
  let presenceMap: IPresenceMapComponent
  let logger: jest.Mocked<ILoggerComponent.ILogger>
  let component: ISceneParticipantsComponent

  async function primedPresenceMap(): Promise<IPresenceMapComponent> {
    const map = await createPresenceMapComponent({
      config: createConfigMockedComponent({
        getString: jest.fn().mockResolvedValue('https://pulse.example.com')
      }),
      logs: createLoggerMockedComponent({}),
      metrics: createMetricsMockedComponent({}),
      nats: createNatsMockedComponent({ isEnabled: jest.fn().mockReturnValue(true) }),
      fetch: createFetchMockedComponent({})
    })
    map.applyBatch(decodeParcelChangesFixture('01-snapshot.bin'))
    return map
  }

  async function build(): Promise<void> {
    const logs = createLoggerMockedComponent({})
    component = await createSceneParticipantsComponent({
      contentClient,
      worlds: worlds as any,
      places,
      sceneBanManager,
      presenceMap,
      logs
    })
    logger = logs.getLogger.mock.results[0].value
  }

  beforeEach(async () => {
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
    presenceMap = await primedPresenceMap()
    await build()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when asking about a Genesis City scene', () => {
    it('should answer the land fixture from peers standing on the scene parcels', async () => {
      await expect(component.getParticipantAddresses(paramsOf(LAND.request))).resolves.toEqual(LAND.body.data.addresses)
    })

    it('should resolve the requested pointer through the catalyst', async () => {
      await component.getParticipantAddresses(paramsOf(LAND.request))

      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith(LAND.catalyst.fetchEntitiesByPointers)
    })

    describe('and the scene has a banned address', () => {
      beforeEach(() => {
        sceneBanManager.listBannedAddresses.mockResolvedValue(BANNED.gatekeeperBans)
      })

      it('should remove the banned wallet case-insensitively', async () => {
        sceneBanManager.listBannedAddresses.mockResolvedValue(
          BANNED.gatekeeperBans.map((address: string) => address.toUpperCase())
        )

        await expect(component.getParticipantAddresses(paramsOf(BANNED.request))).resolves.toEqual(
          BANNED.body.data.addresses
        )
      })
    })

    describe('and no scene is deployed there', () => {
      beforeEach(() => {
        contentClient.fetchEntitiesByPointers.mockResolvedValue([])
      })

      it('should report the pointer as not found', async () => {
        await expect(component.getParticipantAddresses(paramsOf(LAND.request))).rejects.toThrow(
          'No scene found for pointer: -1,0'
        )
      })
    })
  })

  describe('when asking about a whole world', () => {
    it('should match the mixed-case realm name case-insensitively', async () => {
      await expect(component.getParticipantAddresses(paramsOf(WORLD.request))).resolves.toEqual(
        WORLD.body.data.addresses
      )
    })

    it('should recognize an uppercase .ETH suffix as a world request', async () => {
      await expect(component.getParticipantAddresses({ realmName: 'COZYFARM.DCL.ETH' })).resolves.toEqual(
        WORLD.body.data.addresses
      )
    })
  })

  describe.each(WORLD_POINTER.cases.map((testCase: any) => [testCase.request, testCase] as const))(
    'when asking about the world scene in "%s"',
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

      it('should answer with peers standing on that scene only', async () => {
        await expect(component.getParticipantAddresses(paramsOf(testCase.request))).resolves.toEqual(
          testCase.body.data.addresses
        )
      })
    }
  )

  describe('when the presence map has no live source', () => {
    beforeEach(async () => {
      presenceMap = createPresenceMapMockedComponent({ isReady: jest.fn().mockReturnValue(false) })
      await build()
    })

    it('should report warming instead of an empty scene', async () => {
      await expect(component.getParticipantAddresses(paramsOf(LAND.request))).rejects.toThrow(PresenceMapWarmingError)
    })

    it('should log why the route is unavailable', async () => {
      await expect(component.getParticipantAddresses(paramsOf(LAND.request))).rejects.toThrow(PresenceMapWarmingError)

      expect(logger.warn).toHaveBeenCalledWith(
        'The presence map is not primed yet; answering /scene-participants with 503 warming'
      )
    })
  })

  describe('when the request identifies neither a scene nor a world', () => {
    it('should reject it as invalid', async () => {
      await expect(component.getParticipantAddresses({ pointer: null, realmName: 'main' })).rejects.toThrow(
        'Either pointer with realm_name or a world realm_name must be provided'
      )
    })
  })
})
