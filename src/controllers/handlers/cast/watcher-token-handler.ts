import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function watcherTokenHandler(
  context: HandlerContextWithPath<'logs' | 'cast', '/cast/watcher-token'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast },
    request
  } = context

  const logger = logs.getLogger('watcher-token-handler')

  let body: { roomId: string; identity: string }
  try {
    body = await request.json()
  } catch (error) {
    throw new InvalidRequestError('Invalid JSON body')
  }

  if (!body.roomId) {
    throw new InvalidRequestError('Room ID is required')
  }

  if (!body.identity || body.identity.trim() === '') {
    throw new InvalidRequestError('Identity is required')
  }

  // Call cast component to generate watcher credentials
  const credentials = await cast.generateWatcherCredentials(body.roomId, body.identity)

  logger.info(`Watcher credentials generated for room ${body.roomId}`)

  return {
    status: 200,
    body: credentials
  }
}
