import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { PresentationBotTokenRequestBody } from './schemas'

export async function presentationBotTokenHandler(
  context: HandlerContextWithPath<'logs' | 'cast', '/cast/presentation-bot-token'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast },
    request
  } = context

  const logger = logs.getLogger('presentation-bot-token-handler')

  const body: PresentationBotTokenRequestBody = await request.json()

  try {
    const result = await cast.generatePresentationBotToken(body.streamingKey)

    logger.info(`Presentation bot token generated for room ${result.roomId}`)

    return {
      status: 200,
      body: result
    }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        status: 401,
        body: {
          error: error.message
        }
      }
    } else if (error instanceof InvalidRequestError) {
      return {
        status: 400,
        body: {
          error: error.message
        }
      }
    }
    logger.error('Failed to generate presentation bot token', { error: JSON.stringify(error) })
    return {
      status: 500,
      body: {
        error: 'Failed to generate presentation bot token'
      }
    }
  }
}
