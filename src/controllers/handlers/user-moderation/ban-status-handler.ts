import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'

/**
 * Reports whether an address has an active platform ban of its own.
 *
 * This answers a narrower question than the one the connection gate answers, and the two
 * intentionally disagree. Every token path calls `getActiveBanForConnection`, which also matches a
 * device id against the device snapshot captured on other players' bans — the one the request
 * arrives with, or the address's last recorded device when the request carries none. So a ban
 * evader on a fresh wallet is rejected there while this endpoint still reports `isBanned: false`.
 *
 * That gap is deliberate, so do not "fix" it by switching to a device-aware lookup:
 *
 * - This route is unauthenticated. A device-aware answer would let anyone query two arbitrary
 *   addresses and infer from a shared ban that they belong to the same device, turning a public
 *   endpoint into a wallet-linkage oracle. This is the load-bearing reason.
 * - It would hand ban evaders a probe. An evader could check a new wallet here before connecting
 *   and learn whether their device is already covered, then discard wallets until one comes back
 *   clean. Keeping device enforcement undisclosed means the only way to discover it is to be
 *   rejected by it.
 *
 * Note that the third reason this once gave — that a device-aware answer here would consult the
 * address's *last recorded* device rather than the one a future connection arrives from, and so
 * could differ from the enforced answer — no longer holds: the gate itself now falls back to that
 * same last recorded device when a request carries no device identifier. The disclosure reasons
 * above are what keep this endpoint address-only.
 *
 * `isPlayerBanned` is therefore the correct dependency here, and it must stay strictly
 * address-only for a second reason: `banPlayer` uses it as the duplicate-ban guard, and a
 * device-aware version would make a wallet that merely shares a device with a banned player
 * impossible to ban (the guard would throw) and impossible to lift (`liftBan` matches on
 * `banned_address`).
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
