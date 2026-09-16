import { IBaseComponent } from '@well-known-components/interfaces'

export type IModerationEpochComponent = IBaseComponent & {
  /** The current epoch. Moves forward on every moderation change. */
  current(): number
  /** Records a moderation change: every access decision computed before this call is stale. */
  bump(): void
}
