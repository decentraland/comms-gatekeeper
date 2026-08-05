import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
import { UserBan } from '../../../logic/user-moderation/types'

/**
 * Which identifier the ban matched on, so a client can word the notice correctly: `address` is the
 * player's own ban, `device` is another player's ban covering the device this address is recorded
 * on. Absent when not banned.
 */
export type BanMatch = 'address' | 'device'

export type BanStatusResponse = { isBanned: boolean; matchedOn?: BanMatch; ban?: UserBan }

/**
 * Reports whether an address would be rejected by a platform ban — its own, or one matching the
 * device it is recorded on. Answers the same question as the connection gate, so a client is told
 * it is banned rather than only discovering it when a token request fails.
 *
 * `matchedOn` says which identifier matched, so a client can distinguish "you are banned" from
 * "the device you are on is banned" — the second is not the player's own record and carries no
 * reason or expiry to show.
 *
 * Two constraints hold this shape:
 *
 * - The ban record is returned only for the address's own ban. A device match would otherwise
 *   publish another player's row on an unauthenticated route, including whose wallet it is.
 * - It calls `getActiveBanForConnection`, never `isPlayerBanned`. `banPlayer` uses the latter as
 *   its duplicate guard and `liftBan` matches on `banned_address`, so widening it would make a
 *   wallet that merely shares a device impossible to ban and impossible to lift.
 *
 * The route is unauthenticated, so a caller can test any address for device coverage. That is an
 * accepted trade-off for telling banned players why they are blocked.
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

    // The record is exposed only for the address's own ban: a device match points at another
    // player's row, which would disclose whose wallet is banned on an unauthenticated route.
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
