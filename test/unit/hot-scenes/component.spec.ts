import { ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'
import { Entity } from '@dcl/schemas'
import { IBaseComponent, START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { createHotScenesComponent, HotSceneInfo, IHotScenesComponent } from '../../../src/logic/hot-scenes'
import { createPresenceMapComponent, IPresenceMapComponent } from '../../../src/logic/presence-map'
import { createConfigMockedComponent } from '../../mocks/config-mock'
import { createContentClientMockedComponent } from '../../mocks/content-client-mock'
import { createFetchMockedComponent } from '../../mocks/fetch-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createMetricsMockedComponent } from '../../mocks/metrics-mock'
import { createNatsMockedComponent } from '../../mocks/nats-mock'
import { createPresenceMapMockedComponent } from '../../mocks/presence-map-mock'
import { readFixtureJson } from '../../fixtures/iteration-2/loader'

type FixtureCase = {
  name: string
  scenes?: Record<string, any>
  fetchScenesReturns?: any[]
  mainRealmParcelCounts?: Array<{ parcel: [number, number]; peersCount: number }>
  presence?: Array<{ address: string; realm: string; parcel: [number, number] }>
  calculateThumbnail: string | null
  expected?: HotSceneInfo[]
  expectedIds?: string[]
}

const FIXTURE = readFixtureJson<{ cases: FixtureCase[] }>('hot-scenes/fixture.json')

const startOptions: IBaseComponent.ComponentStartOptions = {
  started: () => true,
  live: () => true,
  getComponents: () => ({})
}

function entitiesOf(fixtureCase: FixtureCase): Entity[] {
  if (fixtureCase.fetchScenesReturns) {
    return fixtureCase.fetchScenesReturns as Entity[]
  }
  return Object.values(fixtureCase.scenes ?? {}).map(
    (scene: any) =>
      ({
        content: [],
        pointers: scene.metadata?.scene?.parcels ?? [],
        ...scene
      }) as Entity
  )
}

describe('hot-scenes component', () => {
  let component: IHotScenesComponent
  let presenceMap: jest.Mocked<IPresenceMapComponent>
  let contentClient: ReturnType<typeof createContentClientMockedComponent>

  async function build(options: { settings?: Record<string, string | undefined>; map?: IPresenceMapComponent } = {}) {
    const values: Record<string, string | undefined> = { PRESENCE_MAP_ENABLED: 'true', ...options.settings }
    const config = createConfigMockedComponent({
      getString: jest.fn().mockImplementation((key: string) => Promise.resolve(values[key])),
      getNumber: jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(values[key] === undefined ? undefined : Number(values[key]))
        )
    })

    contentClient = createContentClientMockedComponent({
      fetchEntitiesByPointers: jest.fn().mockResolvedValue([]),
      calculateThumbnail: jest.fn().mockReturnValue(undefined)
    })
    presenceMap = (options.map ?? createPresenceMapMockedComponent()) as jest.Mocked<IPresenceMapComponent>

    component = await createHotScenesComponent({
      config,
      logs: createLoggerMockedComponent({}),
      presenceMap,
      contentClient
    })

    return component
  }

  describe.each(FIXTURE.cases.map((fixtureCase) => [fixtureCase.name, fixtureCase] as const))(
    'when building the ranking for the contract case "%s"',
    (_name, fixtureCase) => {
      let result: HotSceneInfo[]

      beforeEach(async () => {
        if (fixtureCase.presence) {
          // The world-peers case is proved end to end: real map, fed the peer over the wire
          // format, so "world peers never reach /hot-scenes" is a property of the map lookup and
          // not of a hand-written stub.
          const realMap = await createPresenceMapComponent({
            config: createConfigMockedComponent({ getString: jest.fn().mockResolvedValue(undefined) }),
            logs: createLoggerMockedComponent({}),
            metrics: createMetricsMockedComponent({}),
            nats: createNatsMockedComponent({}),
            fetch: createFetchMockedComponent()
          })
          realMap.applyBatch(
            ParcelChangesBatch.decode(
              ParcelChangesBatch.encode({
                serverName: 'pulse-1',
                seq: 1,
                snapshot: true,
                serverTime: 0,
                changes: fixtureCase.presence.map((peer) => ({
                  address: peer.address,
                  realm: peer.realm,
                  parcel: { x: peer.parcel[0], y: peer.parcel[1] }
                }))
              }).finish()
            )
          )
          await build({ map: realMap })
        } else {
          await build()
          presenceMap.getParcelCounts.mockReturnValue(fixtureCase.mainRealmParcelCounts ?? [])
        }

        contentClient.fetchEntitiesByPointers.mockResolvedValue(entitiesOf(fixtureCase))
        contentClient.calculateThumbnail.mockReturnValue(fixtureCase.calculateThumbnail ?? undefined)

        await component.refresh()
        result = component.getHotScenes()
      })

      it('should produce exactly what the contract pins', () => {
        if (fixtureCase.expected) {
          expect(result).toEqual(fixtureCase.expected)
        } else {
          expect(result.map((scene) => scene.id)).toEqual(fixtureCase.expectedIds)
        }
      })
    }
  )

  describe('when building the ranking', () => {
    beforeEach(async () => {
      await build()
    })

    it('should only ever ask the map for the main realm', async () => {
      await component.refresh()

      expect(presenceMap.getParcelCounts).toHaveBeenCalledWith('main')
      expect(presenceMap.getParcelCounts).toHaveBeenCalledTimes(1)
    })

    it('should ask the catalyst only for the occupied tiles', async () => {
      presenceMap.getParcelCounts.mockReturnValue([
        { parcel: [10, 10], peersCount: 1 },
        { parcel: [-3, 4], peersCount: 2 }
      ])

      await component.refresh()

      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith(['10,10', '-3,4'])
    })

    it('should not call the catalyst at all when nobody is in the main realm', async () => {
      presenceMap.getParcelCounts.mockReturnValue([])

      await component.refresh()

      expect(contentClient.fetchEntitiesByPointers).not.toHaveBeenCalled()
      expect(component.getHotScenes()).toEqual([])
    })

    it('should sort by usersTotalCount descending', async () => {
      presenceMap.getParcelCounts.mockReturnValue([
        { parcel: [0, 0], peersCount: 3 },
        { parcel: [1, 1], peersCount: 9 },
        { parcel: [2, 2], peersCount: 5 }
      ])
      contentClient.fetchEntitiesByPointers.mockResolvedValue([
        sceneEntity('quiet', ['0,0']),
        sceneEntity('busiest', ['1,1']),
        sceneEntity('middling', ['2,2'])
      ] as unknown as Entity[])

      await component.refresh()

      expect(component.getHotScenes().map((scene) => scene.id)).toEqual(['busiest', 'middling', 'quiet'])
    })

    it('should count every parcel of a scene, and report all of them', async () => {
      presenceMap.getParcelCounts.mockReturnValue([
        { parcel: [0, 0], peersCount: 3 },
        { parcel: [0, 1], peersCount: 4 }
      ])
      contentClient.fetchEntitiesByPointers.mockResolvedValue([
        sceneEntity('big', ['0,0', '0,1', '0,2'])
      ] as unknown as Entity[])

      await component.refresh()

      expect(component.getHotScenes()[0]).toMatchObject({
        usersTotalCount: 7,
        parcels: [
          [0, 0],
          [0, 1],
          [0, 2]
        ],
        baseCoords: [0, 0]
      })
    })

    it('should return at most the top 100 scenes', async () => {
      const counts = []
      const entities = []
      for (let i = 0; i < 130; i++) {
        counts.push({ parcel: [i, 0] as [number, number], peersCount: i + 1 })
        entities.push(sceneEntity(`scene-${i}`, [`${i},0`]))
      }
      presenceMap.getParcelCounts.mockReturnValue(counts)
      contentClient.fetchEntitiesByPointers.mockResolvedValue(entities as unknown as Entity[])

      await component.refresh()

      const hotScenes = component.getHotScenes()
      expect(hotScenes).toHaveLength(100)
      expect(hotScenes[0].id).toBe('scene-129')
      expect(hotScenes[99].id).toBe('scene-30')
    })

    it('should keep serving the previous ranking when a refresh fails', async () => {
      presenceMap.getParcelCounts.mockReturnValue([{ parcel: [0, 0], peersCount: 1 }])
      contentClient.fetchEntitiesByPointers.mockResolvedValue([sceneEntity('ok', ['0,0'])] as unknown as Entity[])
      await component.refresh()

      contentClient.fetchEntitiesByPointers.mockRejectedValue(new Error('catalyst is down'))
      await expect(component.refresh()).resolves.toBeUndefined()

      expect(component.getHotScenes().map((scene) => scene.id)).toEqual(['ok'])
    })
  })

  describe('when reporting whether it can answer', () => {
    beforeEach(async () => {
      await build()
      presenceMap.getParcelCounts.mockReturnValue([{ parcel: [10, 10], peersCount: 1 }])
      contentClient.fetchEntitiesByPointers.mockResolvedValue([
        sceneEntity('a-scene', ['10,10'])
      ] as unknown as Entity[])
    })

    it('should not be ready before a refresh has run', () => {
      expect(component.isReady()).toBe(false)
    })

    it('should be ready once a refresh has run against a ready map', async () => {
      await component.refresh()

      expect(component.isReady()).toBe(true)
    })

    it('should not be ready after a refresh that ran before the map was primed', async () => {
      // The boot race: components start in order, so this sweep runs while the prime is still in
      // flight and computes an empty ranking. Reporting that as an answer is "Genesis City is
      // deserted", which is a wrong answer rather than a missing one.
      presenceMap.isReady.mockReturnValue(false)
      presenceMap.getParcelCounts.mockReturnValue([])

      await component.refresh()

      expect(component.getHotScenes()).toEqual([])
      expect(component.isReady()).toBe(false)
    })

    it('should not be ready when the first sweep fails, because there is no previous ranking to keep', async () => {
      contentClient.fetchEntitiesByPointers.mockRejectedValue(new Error('catalyst is down'))

      await component.refresh()

      expect(component.isReady()).toBe(false)
    })

    it('should stay ready when a later sweep fails, because the previous ranking is still served', async () => {
      await component.refresh()
      contentClient.fetchEntitiesByPointers.mockRejectedValue(new Error('catalyst is down'))

      await component.refresh()

      expect(component.isReady()).toBe(true)
      expect(component.getHotScenes().map((scene) => scene.id)).toEqual(['a-scene'])
    })

    it('should be ready with an empty ranking when a live map reports a genuinely empty main realm', async () => {
      // Genuinely empty *and* live: the presence map reports itself ready only while a publisher
      // is feeding it (or the prime is still young), so an empty ranking under a ready map is a
      // fact about the city rather than the map an outage emptied.
      presenceMap.getParcelCounts.mockReturnValue([])

      await component.refresh()

      expect(component.getHotScenes()).toEqual([])
      expect(component.isReady()).toBe(true)
    })

    it('should keep the ranking it has when a sweep runs against a map with no live source', async () => {
      await component.refresh()

      // The publishers went silent and the reclaim sweep emptied the map, so it stopped reporting
      // itself ready. The route answers 503 on that alone — but replacing the ranking with the
      // empty one this sweep computes is what would be served the moment the map comes back,
      // before the next sweep can rebuild it.
      presenceMap.isReady.mockReturnValue(false)
      presenceMap.getParcelCounts.mockReturnValue([{ parcel: [20, 20], peersCount: 9 }])
      contentClient.fetchEntitiesByPointers.mockResolvedValue([
        sceneEntity('another-scene', ['20,20'])
      ] as unknown as Entity[])

      await component.refresh()

      expect(component.getHotScenes().map((scene) => scene.id)).toEqual(['a-scene'])
      // Nor is the catalyst asked about counts nothing stands behind.
      expect(contentClient.fetchEntitiesByPointers).toHaveBeenCalledTimes(1)
    })
  })

  describe('when starting', () => {
    afterEach(async () => {
      await (component as IBaseComponent)[STOP_COMPONENT]?.()
    })

    describe('and the presence map is enabled', () => {
      it('should refresh on the configured interval', async () => {
        jest.useFakeTimers()
        try {
          await build({ settings: { HOT_SCENES_REFRESH_MS: '2500' } })
          await (component as IBaseComponent)[START_COMPONENT]!(startOptions)

          expect(presenceMap.getParcelCounts).toHaveBeenCalledTimes(1)

          jest.advanceTimersByTime(2500)
          expect(presenceMap.getParcelCounts).toHaveBeenCalledTimes(2)
        } finally {
          jest.useRealTimers()
        }
      })
    })

    describe('and the presence map is disabled', () => {
      it('should not schedule anything and serve an empty ranking', async () => {
        jest.useFakeTimers()
        try {
          await build({ settings: { PRESENCE_MAP_ENABLED: undefined } })
          await (component as IBaseComponent)[START_COMPONENT]!(startOptions)

          jest.advanceTimersByTime(60_000)

          expect(presenceMap.getParcelCounts).not.toHaveBeenCalled()
          expect(component.getHotScenes()).toEqual([])
        } finally {
          jest.useRealTimers()
        }
      })
    })
  })
})

function sceneEntity(id: string, parcels: string[]): unknown {
  return {
    id,
    content: [],
    pointers: parcels,
    metadata: { scene: { base: parcels[0], parcels }, display: { title: id } }
  }
}
