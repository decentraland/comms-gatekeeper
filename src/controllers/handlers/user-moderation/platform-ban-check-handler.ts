import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'

/**
 * Handler for checking whether a connection is platform-banned, by address or by device id.
 *
 * Service-to-service endpoint authenticated via bearer token (COMMS_GATEKEEPER_AUTH_TOKEN),
 * used by worlds-content-server before issuing a world LiveKit token. Unlike the public
 * GET /users/:address/bans, it takes the connection's device id so a ban recorded against a
 * device is enforced even when the caller presents a different wallet, and it returns only a
 * boolean so the recorded device id is never disclosed.
 *
 * @param context - The handler context with userModeration and logs components.
 * @returns A response with { isBanned: boolean }.
 */
export async function platformBanCheckHandler(
  context: HandlerContextWithPath<'userModeration' | 'logs', '/users/:address/ban-status'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userModeration, logs },
    params: { address },
    url
  } = context

  const logger = logs.getLogger('platform-ban-check-handler')

  // Absent or empty means "no device to match on": the lookup then bans by address only.
  const deviceId = url.searchParams.get('deviceId')

  try {
    const { isBanned } = await userModeration.getActiveBanForConnection({ address, deviceId })

    return {
      status: 200,
      body: {
        isBanned
      }
    }
  } catch (error) {
    // Surface the failure rather than failing open here: the caller retries transient errors
    // and applies its own fail-open, which a 200 { isBanned: false } would silently skip.
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error checking platform ban status for ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
