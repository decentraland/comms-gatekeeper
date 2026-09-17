import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
import { RecordConnectionRequestBody } from './schemas'

/**
 * Handler for recording the connection info (device id, IP) of a connecting player.
 *
 * Service-to-service endpoint authenticated via bearer token (COMMS_GATEKEEPER_AUTH_TOKEN),
 * used by worlds-content-server when it issues a world LiveKit token. This service records the
 * same information on its own token paths; worlds issues tokens without passing through them, so
 * without this a player who only ever connects to multi-scene worlds would have no recorded
 * device, and a later ban would capture no device id to enforce against.
 *
 * The address is lowercased to match how bans and connection lookups normalize it — a
 * differently-cased row would be invisible to `banPlayer`'s device snapshot.
 *
 * @param context - The handler context with playerConnectionDb and logs components.
 * @returns 204 on success.
 */
export async function recordConnectionHandler(
  context: Pick<
    HandlerContextWithPath<'playerConnectionDb' | 'logs', '/users/:address/connection-info'>,
    'components' | 'params' | 'request'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { playerConnectionDb, logs },
    params: { address },
    request
  } = context

  const logger = logs.getLogger('record-connection-handler')
  const normalizedAddress = address.toLowerCase()

  try {
    const body = (await request.json()) as RecordConnectionRequestBody

    await playerConnectionDb.upsertPlayerConnection({
      address: normalizedAddress,
      ipAddress: body.ipAddress,
      deviceId: body.deviceId
    })

    return {
      status: 204
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error recording connection info for ${normalizedAddress}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
