import { test } from '../components'
import { decodeParcelChangesFixture, readFixtureJson } from '../fixtures/iteration-2/loader'
import { snapshotEnv } from '../utils'

test('GET /scene-participants resolved on the Pulse presence map', ({ components, stubComponents, beforeStart }) => {
  const LAND = readFixtureJson<any>('scene-participants/land.json')
  const WORLD = readFixtureJson<any>('scene-participants/world.json')
  const WORLD_POINTER = readFixtureJson<any>('scene-participants/world-pointer.json')
  const BANNED = readFixtureJson<any>('scene-participants/banned-filtered.json')
  const restoreEnv = snapshotEnv('NATS_URL', 'PULSE_URL')

  beforeStart(() => {
    process.env.NATS_URL = process.env.NATS_TEST_URL ?? 'localhost:4222'
    // The fixture drives the map directly, so the asynchronous boot prime intentionally reaches
    // a closed port. Presence readiness comes from the contract snapshot below.
    process.env.PULSE_URL = 'http://127.0.0.1:9'
  })

  afterAll(() => {
    restoreEnv()
  })

  beforeEach(() => {
    components.presenceMap.applyBatch(decodeParcelChangesFixture('01-snapshot.bin'))
    stubComponents.places.getPlaceByParcel.mockResolvedValue({ id: 'land-place' } as any)
    stubComponents.places.getWorldByName.mockResolvedValue({ id: 'world-place' } as any)
    stubComponents.places.getWorldScenePlaceByEntityId.mockResolvedValue({ id: 'world-scene-place' } as any)
    stubComponents.sceneBanManager.listBannedAddresses.mockResolvedValue([])
  })

  describe('when asking about a Genesis City scene', () => {
    beforeEach(() => {
      stubComponents.contentClient.fetchEntitiesByPointers.mockResolvedValue(LAND.catalyst.returns)
    })

    it('should answer with the peers standing on its parcels', async () => {
      const response = await components.localFetch.fetch(LAND.request.replace('GET ', ''))

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(LAND.body)
    })

    describe('and one peer is banned from the place', () => {
      beforeEach(() => {
        stubComponents.sceneBanManager.listBannedAddresses.mockResolvedValue(BANNED.gatekeeperBans)
      })

      it('should remove the banned wallet from the response', async () => {
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

test('GET /scene-participants without NATS', ({ components, beforeStart }) => {
  const restoreEnv = snapshotEnv('NATS_URL', 'PULSE_URL')

  beforeStart(() => {
    delete process.env.NATS_URL
    delete process.env.PULSE_URL
  })

  afterAll(() => {
    restoreEnv()
  })

  describe('when the presence map has no live source', () => {
    it('should answer 503 warming', async () => {
      const response = await components.localFetch.fetch('/scene-participants?realm_name=cozyfarm.dcl.eth')

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ ok: false, error: 'warming' })
    })
  })
})
