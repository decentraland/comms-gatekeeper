import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'

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

    // This route is unauthenticated so the client can render a "you are banned" screen. Only
    // expose fields that are safe to show the banned user; never leak moderation internals
    // (moderator identity `bannedBy`, the captured device fingerprint `bannedDeviceId`, the
    // internal `reason`/ids), which would otherwise be harvestable for any enumerated address.
    const data = banStatus.isBanned
      ? {
          isBanned: true as const,
          expiresAt: banStatus.ban?.expiresAt ?? null,
          customMessage: banStatus.ban?.customMessage ?? null
        }
      : { isBanned: false as const }

    return {
      status: 200,
      body: {
        data
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
