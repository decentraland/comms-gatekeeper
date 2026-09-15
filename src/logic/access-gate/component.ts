import { AppComponents } from '../../types'
import { ConnectionBanQuery } from '../user-moderation/types'
import { AccessGateOptions, AccessState, IAccessGateComponent } from './types'

/** What the cache holds: the decision and the moderation epoch it was computed under. */
type CachedDecision = { state: AccessState; epoch: number }

/**
 * Creates the shared platform-access lookup used by every path that issues a LiveKit token.
 *
 * Both gates only depend on the resolved identity and are independent of each other, so they
 * run concurrently to save a round-trip on the hot path. The component deliberately stops at
 * the lookup: precedence between the two flags and the resulting error response differ per
 * caller and stay there. The policies it does own are the optional ban-lookup fail-open, which
 * has to happen inside the concurrent pair to leave the deny-list result intact, and the
 * optional result cache for callers that can tolerate a stale answer: the cluster feed can see
 * many events per wallet within seconds, and banning also removes the participant from every
 * live room. The cache is the `accessGateCache` instance, bounded and given its TTL where it
 * is created (`ACCESS_GATE_CACHE_TTL_MS`). Every cached decision carries the moderation epoch it
 * was computed under and is honoured only while that epoch is current, so a ban or lift, which
 * moves the epoch on, reaches the next lookup even when the decision was cached moments before
 * or was still being computed when the ban landed.
 *
 * @param components - The user moderation, deny list, access gate cache, moderation epoch and
 * logs components.
 * @returns The access gate component.
 */
export async function createAccessGateComponent(
  components: Pick<AppComponents, 'userModeration' | 'denyList' | 'accessGateCache' | 'moderationEpoch' | 'logs'>
): Promise<IAccessGateComponent> {
  const { userModeration, denyList, accessGateCache, moderationEpoch, logs } = components
  const logger = logs.getLogger('access-gate')

  function cacheKey({ address, deviceId }: ConnectionBanQuery): string {
    return `${address.toLowerCase()}|${deviceId ?? ''}`
  }

  async function getAccessState(query: ConnectionBanQuery, options: AccessGateOptions = {}): Promise<AccessState> {
    const key = cacheKey(query)
    // Read before the lookups, and stamped into whatever they produce: a ban landing while they
    // run moves the epoch on, and the decision written below is then already stale on arrival.
    const epoch = moderationEpoch.current()
    if (options.cached) {
      const hit = await accessGateCache.get<CachedDecision>(key)
      if (hit && hit.epoch === epoch) {
        return { ...hit.state }
      }
    }

    const { address, deviceId } = query
    let banLookupFailed = false
    const banLookup = userModeration.getActiveBanForConnection({ address, deviceId })

    const [banStatus, isDenylisted] = await Promise.all([
      options.failOpenOnBanLookupError
        ? banLookup.catch((error) => {
            banLookupFailed = true
            logger.warn(`Error checking platform ban status for ${address}: ${error}`)
            return { isBanned: false }
          })
        : banLookup,
      denyList.isDenylisted(address)
    ])

    const state: AccessState = { isBanned: banStatus.isBanned, isDenylisted }
    // A swallowed failure must not be remembered as "allowed" for the whole TTL. No per-call
    // TTL: the instance default applies, and the per-call parameter is in seconds.
    if (options.cached && !banLookupFailed) {
      await accessGateCache.set<CachedDecision>(key, { state, epoch })
    }

    return state
  }

  return { getAccessState }
}
