import { LRUCache } from 'lru-cache'
import { AppComponents } from '../../types'
import { positiveNumberOr } from '../../utils/config'
import { IAssignmentMirrorComponent, MirrorEntry } from './types'

const DEFAULT_TTL_MS = 60 * 60 * 1000
const DEFAULT_MAX = 20_000

/**
 * Creates the bounded, per-wallet record of the cluster Pulse last assigned each peer to.
 *
 * Its only consumer is the reconnect re-announcement, which needs an assignment for a wallet
 * this replica may never have minted for. That is what separates it from `peer-state`: minting
 * is queue-grouped, so a replica's peer state covers only the events it was personally handed,
 * and answering a reconnect from it would announce whichever cluster that replica happened to
 * remember. This one is written from an un-grouped subscription, so every replica agrees.
 *
 * Sized by `CLUSTER_ASSIGNMENT_MIRROR_MAX` and `CLUSTER_ASSIGNMENT_MIRROR_TTL_MS`. Consumed by
 * the reconnect re-announcement and, since the session field, by its gate: a connect from a
 * session other than the recorded one is not re-announced.
 *
 * @param components - The config component.
 * @returns The assignment mirror component.
 */
export async function createAssignmentMirrorComponent(
  components: Pick<AppComponents, 'config'>
): Promise<IAssignmentMirrorComponent> {
  const { config } = components

  const [maxSetting, ttlSetting] = await Promise.all([
    config.getNumber('CLUSTER_ASSIGNMENT_MIRROR_MAX'),
    config.getNumber('CLUSTER_ASSIGNMENT_MIRROR_TTL_MS')
  ])

  const cache = new LRUCache<string, MirrorEntry>({
    max: positiveNumberOr(maxSetting, DEFAULT_MAX),
    // Guarded rather than `??` for the same reason as every other bound here: lru-cache reads
    // a configured 0 as unbounded, and a ttl of 0 as never expiring.
    ttl: positiveNumberOr(ttlSetting, DEFAULT_TTL_MS)
  })

  function get(wallet: string): MirrorEntry | undefined {
    return cache.get(wallet)
  }

  function set(wallet: string, entry: MirrorEntry): void {
    cache.set(wallet, entry)
  }

  function size(): number {
    return cache.size
  }

  return { get, set, size }
}
