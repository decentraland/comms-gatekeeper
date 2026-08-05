import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'

/**
 * Reports whether an address has an active platform ban of its own.
 *
 * Intentionally narrower than the connection gate: `getActiveBanForConnection` also matches a
 * device id, so an evader on a fresh wallet is rejected at token issuance while this reports
 * `isBanned: false`. Do not close that gap by making the lookup device-aware:
 *
 * - The route is unauthenticated, so a device-aware answer would let anyone link two arbitrary
 *   addresses to the same device.
 * - It would let an evader test fresh wallets here and cycle until one came back clean.
 * - `banPlayer` uses `isPlayerBanned` as its duplicate guard and `liftBan` matches on
 *   `banned_address`, so a device-aware version would make a wallet that merely shares a device
 *   impossible to ban and impossible to lift.
 *
 * The response does include `bannedDeviceId`; that disclosure is accepted. What is withheld is
 * querying *by* device.
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
    const banStatus = await userModeration.isPlayerBanned(address)

    return {
      status: 200,
      body: {
        data: banStatus
      }
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
