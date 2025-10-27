import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { StreamerTokenRequestBody } from './schemas'

export async function streamerTokenHandler(
  context: HandlerContextWithPath<'logs' | 'cast', '/cast/streamer-token'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast },
    request
  } = context

  const logger = logs.getLogger('streamer-token-handler')

  const body: StreamerTokenRequestBody = await request.json()

  // Call cast component to validate and generate credentials
  const credentials = await cast.validateStreamerToken(body.token, body.identity)

  logger.info(`Streamer credentials generated for room ${credentials.roomId}`)

  return {
    status: 200,
    body: credentials
  }
}
