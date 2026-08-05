import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
import { UserBan } from '../../../logic/user-moderation/types'

/** `address` is the player's own ban; `device` is another player's ban covering their device. */
export type BanMatch = 'address' | 'device'

export type BanStatusResponse = { isBanned: boolean; matchedOn?: BanMatch; ban?: UserBan }

/**
 * Reports whether an address would be rejected by a platform ban — its own, or one matching the
 * device it is recorded on. Unauthenticated, so any address can be tested for device coverage.
 *
 * Uses `getActiveBanForConnection`, not `isPlayerBanned`: widening the latter would break
 * `banPlayer`'s duplicate guard, which `liftBan` cannot then undo.
 */
export async function banStatusHandler(
  context: Pick<HandlerContextWithPath<'userModeration' | 'logs', '/users/:address/bans'>, 'components' | 'params'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userModeration, logs },
    params: { address }
  } = context

  const logger = logs.getLogger('ban-status-handler')

  try {
    const banStatus = await userModeration.getActiveBanForConnection({ address })

    // Withhold the record on a device match: it is another player's row.
    const isOwnBan = banStatus.ban?.bannedAddress === address.toLowerCase()

    let data: BanStatusResponse = { isBanned: false }
    if (banStatus.isBanned) {
      data = isOwnBan
        ? { isBanned: true, matchedOn: 'address', ban: banStatus.ban }
        : { isBanned: true, matchedOn: 'device' }
    }

    return {
      status: 200,
      body: { data }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error getting ban status for player ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
