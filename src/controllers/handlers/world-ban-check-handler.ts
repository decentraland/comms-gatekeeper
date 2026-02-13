import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../types'

/**
 * Handler for checking if a user is banned from a world.
 *
 * This endpoint is authenticated via bearer token (COMMS_GATEKEEPER_AUTH_TOKEN)
 * and is intended for service-to-service communication (e.g. worlds-content-server).
 *
 * @param context - The handler context with sceneBans and logs components.
 * @returns A response with { isBanned: boolean }.
 */
export async function worldBanCheckHandler(
  context: HandlerContextWithPath<'sceneBans' | 'logs', '/worlds/:worldName/users/:address/ban-status'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { sceneBans, logs }
  } = context

  const logger = logs.getLogger('world-ban-check-handler')

  const { worldName, address } = context.params

  try {
    const isBanned = await sceneBans.isUserBanned(address, {
      realmName: worldName,
      isWorld: true,
      parcel: ''
    })

    logger.debug(`Ban check for ${address} in world ${worldName}: ${isBanned ? 'banned' : 'not banned'}`)

    return {
      status: 200,
      body: {
        isBanned
      }
    }
  } catch (error) {
    logger.warn(`Error checking ban status for ${address} in world ${worldName}: ${error}`)

    return {
      status: 200,
      body: {
        isBanned: false
      }
    }
  }
}
