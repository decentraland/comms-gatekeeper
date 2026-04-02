import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
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

  const result = await cast.generatePresentationBotToken(body.streamingKey)

  logger.info(`Presentation bot token generated for room ${result.roomId}`)

  return {
    status: 200,
    body: result
  }
}
