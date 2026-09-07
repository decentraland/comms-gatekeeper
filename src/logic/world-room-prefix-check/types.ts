import { IBaseComponent } from '@well-known-components/interfaces'

export type IWorldRoomPrefixCheckComponent = IBaseComponent & {
  /**
   * Asks LiveKit whether the rooms this service computes for the worlds the content server
   * reports as live actually exist.
   *
   * Never throws and never fails startup: a failure here means the LiveKit world path is
   * misconfigured, not that this service cannot run. Public so it can be re-run on demand.
   *
   * @returns `false` when there is at least one live world and none of the computed rooms
   * exists — the mismatch gauge is raised and the detail logged. `true` when at least one does,
   * and also when there was nothing to compare (no world was live, the worlds content server
   * could not be reached, or LiveKit could not be asked): an unobserved mismatch is not a
   * mismatch.
   */
  check(): Promise<boolean>
}
