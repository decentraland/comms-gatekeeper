import { IBaseComponent } from '@well-known-components/interfaces'
import { ParcelCoord } from '../presence-map'

/**
 * One entry of `GET /hot-scenes`. Shape frozen by contract C3: it is what archipelago-stats
 * served, field for field, so the places integration and the explorer need no change.
 */
export type HotSceneInfo = {
  id: string
  name: string
  baseCoords: ParcelCoord
  usersTotalCount: number
  parcels: ParcelCoord[]
  thumbnail?: string
  creator?: string
  projectId?: string
  description?: string
}

export type IHotScenesComponent = IBaseComponent & {
  /**
   * Whether a ranking exists to serve: false until a refresh has completed against a presence map
   * that was ready. It is its own readiness, not the map's — the map flips ready the moment the
   * prime resolves, while the ranking needs a catalyst sweep, and until that has landed there is
   * nothing to answer with. Callers serve `503 warming` while this is false.
   */
  isReady(): boolean
  /** The most recently computed ranking. Empty until the first refresh completes. */
  getHotScenes(): HotSceneInfo[]
  /**
   * Recomputes the ranking from the presence map and the catalyst.
   *
   * Never throws and never leaves a partial result: a failed refresh keeps the previous ranking,
   * so a catalyst blip does not empty `/hot-scenes`. Runs on a timer; public so tests and
   * operators can force one.
   */
  refresh(): Promise<void>
}
