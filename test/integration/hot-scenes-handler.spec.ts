import { ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'
import { Entity } from '@dcl/schemas'
import { test } from '../components'
import { readFixtureJson } from '../fixtures/iteration-2/loader'

/** The contract pack's `hot-scenes/fixture.json`, whose "ok" case pins the served body. */
const FIXTURE = readFixtureJson<{ cases: any[] }>('hot-scenes/fixture.json')
const OK_CASE = FIXTURE.cases.find((testCase) => testCase.name === 'ok')!

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
  const previousEnv = {
    presenceMap: process.env.PRESENCE_MAP_ENABLED,
    refresh: process.env.HOT_SCENES_REFRESH_MS
  }

  beforeStart(() => {
    process.env.PRESENCE_MAP_ENABLED = 'true'
    // Long enough that the timer never fires mid-test; the refreshes here are explicit.
    process.env.HOT_SCENES_REFRESH_MS = '3600000'
  })

  afterAll(() => {
    // Jest reuses a worker process across spec files, so the flags must not outlive this suite.
    process.env.PRESENCE_MAP_ENABLED = previousEnv.presenceMap
    process.env.HOT_SCENES_REFRESH_MS = previousEnv.refresh
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
    await components.hotScenes.refresh()

    const response = await components.localFetch.fetch('/hot-scenes')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(OK_CASE.expected)
    expect(stubComponents.contentClient.fetchEntitiesByPointers).toHaveBeenCalledWith(['10,10', '10,11'])
  })
})
