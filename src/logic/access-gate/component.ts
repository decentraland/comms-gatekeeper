import { AppComponents } from '../../types'
import { ConnectionBanQuery } from '../user-moderation/types'
import { accessGateCacheKey } from './cache-keys'
import { AccessGateOptions, AccessState, IAccessGateComponent } from './types'

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
 * is created (`ACCESS_GATE_CACHE_TTL_MS`).
 *
 * @param components - The user moderation, deny list, access gate cache and logs components.
 * @returns The access gate component.
 */
export async function createAccessGateComponent(
  components: Pick<AppComponents, 'userModeration' | 'denyList' | 'accessGateCache' | 'logs'>
): Promise<IAccessGateComponent> {
  const { userModeration, denyList, accessGateCache, logs } = components
  const logger = logs.getLogger('access-gate')

  async function getAccessState(query: ConnectionBanQuery, options: AccessGateOptions = {}): Promise<AccessState> {
    const key = accessGateCacheKey(query)
    if (options.cached) {
      const hit = await accessGateCache.get<AccessState>(key)
      if (hit) {
        return { ...hit }
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
      await accessGateCache.set(key, state)
    }

    return state
  }

  return { getAccessState }
}
