import { Entity } from '@dcl/schemas'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'
import { AppComponents } from '../../types'
import { positiveNumberOr } from '../../utils/config'
import { getErrorMessage } from '../errors'
import { ParcelCoord } from '../presence-map'
import { HotSceneInfo, IHotScenesComponent } from './types'

/** The maximum amount of hot scenes returned. Ported from archipelago-stats. */
const HOT_SCENES_LIMIT = 100

/** Genesis City only: world peers are counted by the worlds content server, not here. */
const MAIN_REALM = 'main'

const DEFAULT_REFRESH_MS = 10_000
const DEFAULT_SCENE_TTL_MS = 300_000

/**
 * Tiles held in the scene cache. Genesis City is ~90k parcels and this cache is keyed per tile,
 * so it is sized for the occupied fraction of the whole city rather than for one request.
 */
const SCENE_CACHE_MAX = 20_000

type CachedTile = { entity: Entity | null }

function getCoords(coordsAsString: string): ParcelCoord {
  return coordsAsString.split(',').map((part) => parseInt(part, 10)) as ParcelCoord
}

/**
 * Creates the `/hot-scenes` producer: the busiest Genesis City scenes, precomputed.
 *
 * Ported from archipelago-stats' `hot-scenes-handler.ts` with one substitution — the peer
 * positions come from the NATS-fed presence map instead of the retired stats service — so the
 * response stays byte-compatible with what the places integration reads today.
 *
 * Precomputed rather than computed per request: the join needs catalyst metadata for every
 * occupied tile, which is far too slow to do inside an HTTP request, and the answer is identical
 * for every caller.
 *
 * Off unless `PRESENCE_MAP_ENABLED` is `'true'`; when off it schedules nothing and serves an
 * empty ranking, and the handler answers `503 warming` because the map never becomes ready.
 *
 * @param components - The config, logs, presence map and content client components.
 * @returns The hot scenes component.
 */
export async function createHotScenesComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'presenceMap' | 'contentClient'>
): Promise<IHotScenesComponent> {
  const { config, logs, presenceMap, contentClient } = components
  const logger = logs.getLogger('hot-scenes')

  const [enabledFlag, refreshSetting, sceneTtlSetting] = await Promise.all([
    config.getString('PRESENCE_MAP_ENABLED'),
    config.getNumber('HOT_SCENES_REFRESH_MS'),
    config.getNumber('HOT_SCENES_SCENE_TTL_MS')
  ])

  const enabled = enabledFlag === 'true'
  const refreshMs = positiveNumberOr(refreshSetting, DEFAULT_REFRESH_MS)

  // Separate from the content client's own pointer cache on purpose: that one is sized for
  // single-scene lookups (/scene-participants), and letting a city-wide sweep run through it
  // would evict those entries on every refresh. This one is sized for the sweep.
  const sceneCache = new LRUCache<string, CachedTile>({
    max: SCENE_CACHE_MAX,
    ttl: positiveNumberOr(sceneTtlSetting, DEFAULT_SCENE_TTL_MS)
  })

  let hotScenes: HotSceneInfo[] = []
  let refreshing = false
  let timer: NodeJS.Timeout | undefined

  async function resolveScenes(tiles: string[]): Promise<Entity[]> {
    // Keyed by entity id: a scene covers several tiles and must be ranked once.
    const scenes = new Map<string, Entity>()
    const missing: string[] = []

    for (const tile of tiles) {
      const cached = sceneCache.get(tile)
      if (!cached) {
        missing.push(tile)
      } else if (cached.entity) {
        scenes.set(cached.entity.id, cached.entity)
      }
    }

    if (missing.length > 0) {
      const fetched = await contentClient.fetchEntitiesByPointers(missing)
      const resolved = new Set<string>()

      for (const entity of fetched) {
        scenes.set(entity.id, entity)
        for (const pointer of entity.pointers ?? []) {
          sceneCache.set(pointer, { entity })
          resolved.add(pointer)
        }
      }

      // Empty tiles are cached too — most of the city is empty, and re-asking the catalyst about
      // them every refresh is where the cost would be.
      for (const tile of missing) {
        if (!resolved.has(tile)) {
          sceneCache.set(tile, { entity: null })
        }
      }
    }

    return [...scenes.values()]
  }

  function buildRanking(scenes: Entity[], countPerTile: Map<string, number>): HotSceneInfo[] {
    const built: HotSceneInfo[] = scenes
      .filter((scene) => scene.metadata?.scene?.base && scene.metadata?.scene?.parcels)
      .map((scene) => {
        const result: HotSceneInfo = {
          id: scene.id,
          name: scene.metadata?.display?.title,
          baseCoords: getCoords(scene.metadata.scene.base),
          usersTotalCount: 0,
          parcels: scene.metadata.scene.parcels.map(getCoords),
          thumbnail: contentClient.calculateThumbnail(scene),
          creator: scene.metadata?.contact?.name,
          projectId: scene.metadata?.source?.projectId,
          description: scene.metadata?.display?.description
        }

        for (const sceneParcel of scene.metadata.scene.parcels) {
          if (countPerTile.has(sceneParcel)) {
            result.usersTotalCount += countPerTile.get(sceneParcel) || 0
          }
        }

        return result
      })

    return built.sort((scene1, scene2) => scene2.usersTotalCount - scene1.usersTotalCount).slice(0, HOT_SCENES_LIMIT)
  }

  async function refresh(): Promise<void> {
    // A slow catalyst must not let refreshes pile up on top of each other; the next tick picks
    // the work up anyway.
    if (refreshing) {
      logger.debug('Skipping a /hot-scenes refresh: the previous one is still running')
      return
    }
    refreshing = true

    try {
      const countPerTile = new Map<string, number>()
      for (const { parcel, peersCount } of presenceMap.getParcelCounts(MAIN_REALM)) {
        countPerTile.set(`${parcel[0]},${parcel[1]}`, peersCount)
      }

      const tiles = [...countPerTile.keys()]
      if (tiles.length === 0) {
        hotScenes = []
        return
      }

      hotScenes = buildRanking(await resolveScenes(tiles), countPerTile)
    } catch (error) {
      // Kept rather than emptied: an empty /hot-scenes reads as "Genesis City is deserted" to
      // every caller downstream, which is a worse answer than a slightly stale one.
      logger.warn(`Refreshing /hot-scenes failed, serving the previous ranking: ${getErrorMessage(error)}`)
    } finally {
      refreshing = false
    }
  }

  function getHotScenes(): HotSceneInfo[] {
    return hotScenes
  }

  async function start(): Promise<void> {
    if (!enabled) {
      logger.info('Hot scenes are disabled (PRESENCE_MAP_ENABLED is not "true")')
      return
    }

    // Not awaited: the first sweep talks to the catalyst, and HTTP readiness must not wait on it.
    // The handler answers 503 until the presence map is ready anyway.
    void refresh()

    timer = setInterval(() => void refresh(), refreshMs)
    timer.unref?.()

    logger.info(`Hot scenes refresher started (every ${refreshMs}ms)`)
  }

  async function stop(): Promise<void> {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  return {
    getHotScenes,
    refresh,
    [START_COMPONENT]: start,
    [STOP_COMPONENT]: stop
  }
}
