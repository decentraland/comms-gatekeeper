import { IModerationEpochComponent } from './types'

/**
 * Creates the moderation epoch: a process-local counter that user moderation moves forward on
 * every ban or lift, and that the access gate stamps into each cached decision and checks on
 * every read. A decision cached under an older epoch reads as a miss, so a ban reaches the very
 * next mint. It also closes the race a plain cache clear leaves open: a lookup that was in flight
 * when the ban landed writes the epoch it observed before the lookup, which is already behind, so
 * it cannot repopulate a stale allow.
 *
 * One counter for everything rather than one per address: a ban that captured a device also
 * reaches other wallets on that device, whose cached entries do not name it, and moderation
 * actions are rare enough that one re-query per wallet afterwards costs nothing. Single replica;
 * scaling out would need the bump to reach every replica.
 *
 * @returns The moderation epoch component.
 */
export async function createModerationEpochComponent(): Promise<IModerationEpochComponent> {
  let epoch = 0

  return {
    current: () => epoch,
    bump: () => {
      epoch += 1
    }
  }
}
