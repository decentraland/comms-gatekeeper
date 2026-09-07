import { IBaseComponent } from '@well-known-components/interfaces'

export type IWorldRoomPrefixCheckComponent = IBaseComponent & {
  /**
   * Compares the world rooms the worlds content server reports against the room names this
   * service builds for the same worlds.
   *
   * Never throws and never fails startup: a failure here means the LiveKit world path is
   * misconfigured, not that this service cannot run. Public so it can be re-run on demand.
   *
   * @returns `false` when a world's room name does not round-trip through this service's world
   * room prefix — the mismatch gauge is raised and the detail logged. `true` when every reported
   * world round-trips, and also when there was nothing to compare (no world had anyone in it, or
   * the worlds content server could not be reached): an unobserved mismatch is not a mismatch.
   */
  check(): Promise<boolean>
}
