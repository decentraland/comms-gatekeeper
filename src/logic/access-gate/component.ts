import { AppComponents } from '../../types'
import { ConnectionBanQuery } from '../user-moderation/types'
import { AccessGateOptions, AccessState, IAccessGateComponent } from './types'

/**
 * Creates the shared platform-access lookup used by every path that issues a LiveKit token.
 *
 * Both gates only depend on the resolved identity and are independent of each other, so they
 * run concurrently to save a round-trip on the hot path. The component deliberately stops at
 * the lookup: precedence between the two flags and the resulting error response differ per
 * caller and stay there. The one policy it does own is the optional ban-lookup fail-open,
 * because that has to happen inside the concurrent pair to leave the deny-list result intact.
 *
 * @param components - The user moderation, deny list and logs components.
 * @returns The access gate component.
 */
export async function createAccessGateComponent(
  components: Pick<AppComponents, 'userModeration' | 'denyList' | 'logs'>
): Promise<IAccessGateComponent> {
  const { userModeration, denyList, logs } = components
  const logger = logs.getLogger('access-gate')

  async function getAccessState(
    { address, deviceId }: ConnectionBanQuery,
    options: AccessGateOptions = {}
  ): Promise<AccessState> {
    const banLookup = userModeration.getActiveBanForConnection({ address, deviceId })

    const [banStatus, isDenylisted] = await Promise.all([
      options.failOpenOnBanLookupError
        ? banLookup.catch((error) => {
            logger.warn(`Error checking platform ban status for ${address}: ${error}`)
            return { isBanned: false }
          })
        : banLookup,
      denyList.isDenylisted(address)
    ])

    return { isBanned: banStatus.isBanned, isDenylisted }
  }

  return { getAccessState }
}
