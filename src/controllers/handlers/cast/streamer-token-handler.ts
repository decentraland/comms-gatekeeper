import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'

export async function streamerTokenHandler(
  context: HandlerContextWithPath<'logs' | 'cast', '/cast/streamer-token'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast },
    request
  } = context

  const logger = logs.getLogger('streamer-token-handler')

  let body: { token: string }
  try {
    body = await request.json()
  } catch (error) {
    throw new InvalidRequestError('Invalid JSON body')
  }

  if (!body.token) {
    throw new InvalidRequestError('Streaming token is required')
  }

  try {
    // Call cast component to validate and generate credentials
    const credentials = await cast.validateStreamerToken(body.token)

    logger.info(`Streamer credentials generated for room ${credentials.roomId}`)

    return {
      status: 200,
      body: credentials
    }
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof InvalidRequestError) {
      throw error
    }

    logger.error(`Failed to generate streamer credentials: ${(error as Error).message}`)
    throw new InvalidRequestError('Failed to generate streaming credentials')
  }
}
