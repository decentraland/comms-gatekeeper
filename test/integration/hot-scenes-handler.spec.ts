import { ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'
import { Entity } from '@dcl/schemas'
import { test } from '../components'
import { readFixtureJson } from '../fixtures/iteration-2/loader'
import { snapshotEnv } from '../utils'

/** The contract pack's `hot-scenes/fixture.json`, whose "ok" case pins the served body. */
const FIXTURE = readFixtureJson<{ cases: any[] }>('hot-scenes/fixture.json')
const OK_CASE = FIXTURE.cases.find((testCase) => testCase.name === 'ok')!

/** `PRESENCE_SERVER_TTL_MS`'s default, the silence after which a publisher is presumed gone. */
const SERVER_TTL_MS = 150_000

/** `0x…0001`, `0x…0002`, … — one distinct wallet per peer the fixture's counts call for. */
function wallet(index: number): string {
  return `0x${index.toString(16).padStart(40, '0')}`
}

/**
 * A snapshot batch that puts exactly as many peers on each parcel as the fixture's
 * `mainRealmParcelCounts` says, so the ranking is computed from a real presence map fed over the
 * real wire format rather than from a stubbed count.
 */
function snapshotForFixtureCounts(): ParcelChangesBatch {
  let next = 1
  const changes = OK_CASE.mainRealmParcelCounts.flatMap((tile: any) =>
    Array.from({ length: tile.peersCount }, () => ({
      address: wallet(next++),
      realm: 'main',
      parcel: { x: tile.parcel[0], y: tile.parcel[1] }
    }))
  )

  return ParcelChangesBatch.decode(
    ParcelChangesBatch.encode({
      serverName: 'pulse-1',
      seq: 1,
      snapshot: true,
      serverTime: Date.now(),
      changes
    }).finish()
  )
}

test('GET /hot-scenes while the presence map is off', ({ components }) => {
  it('should answer 503 warming rather than report a deserted city', async () => {
    const response = await components.localFetch.fetch('/hot-scenes')

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, error: 'warming' })
  })
})

test('GET /hot-scenes from the presence map', ({ components, stubComponents, beforeStart }) => {
  // Jest reuses a worker process across spec files, so the flags must not outlive this suite —
  // and a key that was unset has to be deleted, not assigned the string "undefined", which
  // config.getNumber then rejects for every program built afterwards in this worker.
  const restoreEnv = snapshotEnv('PRESENCE_MAP_ENABLED', 'HOT_SCENES_REFRESH_MS', 'PULSE_URL')

  beforeStart(() => {
    process.env.PRESENCE_MAP_ENABLED = 'true'
    // Required while the map is on, and deliberately pointed at a closed port: the map here is
    // fed by this spec over the wire format, so the prime must not reach anything. The refused
    // request is caught and logged as one warn line, which is what a program whose Pulse is
    // unreachable does in production too.
    process.env.PULSE_URL = 'http://127.0.0.1:9'
    // Long enough that the timer never fires mid-test; the refreshes here are explicit.
    process.env.HOT_SCENES_REFRESH_MS = '3600000'
  })

  afterAll(() => {
    restoreEnv()
  })

  beforeEach(() => {
    stubComponents.contentClient.fetchEntitiesByPointers.mockResolvedValue([
      {
        id: OK_CASE.scenes['10,10'].id,
        content: [],
        pointers: OK_CASE.scenes['10,10'].metadata.scene.parcels,
        metadata: OK_CASE.scenes['10,10'].metadata
      } as unknown as Entity
    ])
    stubComponents.contentClient.calculateThumbnail.mockReturnValue(OK_CASE.calculateThumbnail)
  })

  // One test, not two: the component caches a tile's resolved scene for HOT_SCENES_SCENE_TTL_MS,
  // so a second refresh in the same program would not ask the catalyst again — which is the
  // point of the cache, and would make a separate assertion on the call read as a failure.
  it('should serve the ranking the contract pins, asking the catalyst only about occupied tiles', async () => {
    components.presenceMap.applyBatch(snapshotForFixtureCounts())

    // The map is ready the moment that snapshot lands, but the sweep that turns it into a ranking
    // has not run: 200 [] here would be "Genesis City is deserted", the one answer this route must
    // never give.
    const warming = await components.localFetch.fetch('/hot-scenes')
    expect(warming.status).toBe(503)
    expect(await warming.json()).toEqual({ ok: false, error: 'warming' })

    await components.hotScenes.refresh()

    const response = await components.localFetch.fetch('/hot-scenes')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(OK_CASE.expected)
    expect(stubComponents.contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith(['10,10', '10,11'])
  })

  it('should answer 503 warming again once every publisher has gone silent, and 200 when one comes back', async () => {
    // The outage: NATS is restarted, or Pulse is rolled, and no batch arrives for longer than
    // PRESENCE_SERVER_TTL_MS. The reclaim sweep presumes the publisher gone and empties the map,
    // so the ranking above describes nothing any more — and "Genesis City is deserted" is a wrong
    // answer where 503 is a missing one. Time is moved rather than waited out; the map's readiness
    // is a comparison against Date.now(), not a flag the sweep sets.
    const duringTheOutage = Date.now() + SERVER_TTL_MS
    const clock = jest.spyOn(Date, 'now').mockReturnValue(duringTheOutage)

    try {
      const warming = await components.localFetch.fetch('/hot-scenes')
      expect(warming.status).toBe(503)
      expect(await warming.json()).toEqual({ ok: false, error: 'warming' })

      // A publisher comes back with its snapshot, exactly as it does after a reconnect.
      components.presenceMap.applyBatch(snapshotForFixtureCounts())
      await components.hotScenes.refresh()

      const response = await components.localFetch.fetch('/hot-scenes')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(OK_CASE.expected)
    } finally {
      clock.mockRestore()
    }
  })
})
