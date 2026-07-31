import { LRUCache } from 'lru-cache'
import { AppComponents } from '../../types'
import { positiveNumberOr } from '../../utils/config'
import { IPeerStateComponent, PeerAssignment } from './types'

const DEFAULT_TTL_MS = 60 * 60 * 1000
const DEFAULT_MAX = 20_000

/**
 * Creates the bounded, per-wallet store of the last cluster assignment seen for each peer.
 *
 * Its only consumer is `fromIslandId`, which needs the exact previous room name. TTL is the
 * only reclamation path: Pulse's feed has no disconnect event, and a departed peer just stops
 * sending cluster_change events. `peer.*.disconnect` still exists but retires in iteration 2
 * and is lossy, so it's deliberately unused here.
 *
 * Sized by `CLUSTER_PEER_STATE_MAX` and `CLUSTER_PEER_STATE_TTL_MS`; the env names keep the
 * `CLUSTER_` prefix they shipped with, since renaming them would be a deployment change.
 *
 * @param components - The config component.
 * @returns The peer state component.
 */
export async function createPeerStateComponent(
  components: Pick<AppComponents, 'config'>
): Promise<IPeerStateComponent> {
  const { config } = components

  const [maxSetting, ttlSetting] = await Promise.all([
    config.getNumber('CLUSTER_PEER_STATE_MAX'),
    config.getNumber('CLUSTER_PEER_STATE_TTL_MS')
  ])

  const cache = new LRUCache<string, PeerAssignment>({
    max: positiveNumberOr(maxSetting, DEFAULT_MAX),
    ttl: positiveNumberOr(ttlSetting, DEFAULT_TTL_MS)
  })

  function get(wallet: string): PeerAssignment | undefined {
    return cache.get(wallet)
  }

  function set(wallet: string, assignment: PeerAssignment): void {
    cache.set(wallet, assignment)
  }

  function size(): number {
    return cache.size
  }

  return { get, set, size }
}
