import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { validate } from '../../../logic/utils'
import { PresenterActionRequestBody } from './schemas'

export async function presenterHandler(
  context: HandlerContextWithPath<'logs' | 'cast' | 'config' | 'fetch', '/cast/presenter'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast },
    request
  } = context

  const logger = logs.getLogger('presenter-handler')

  try {
    const { identity: callerAddress } = await validate(context)

    if (request.method === 'GET') {
      const roomId = context.url.searchParams.get('roomId')
      if (!roomId) {
        throw new InvalidRequestError('roomId query parameter is required')
      }
      const result = await cast.getPresenters(roomId, callerAddress)
      return { status: 200, body: result }
    }

    const body: PresenterActionRequestBody = await request.json()

    if (request.method === 'POST') {
      await cast.promotePresenter(body.roomId, body.participantIdentity, callerAddress)
      logger.info(`Participant ${body.participantIdentity} promoted to presenter in room ${body.roomId}`)
      return { status: 200, body: { message: 'Participant promoted to presenter' } }
    }

    if (request.method === 'DELETE') {
      await cast.demotePresenter(body.roomId, body.participantIdentity, callerAddress)
      logger.info(`Participant ${body.participantIdentity} demoted from presenter in room ${body.roomId}`)
      return { status: 200, body: { message: 'Participant demoted from presenter' } }
    }

    return { status: 405, body: { error: 'Method not allowed' } }
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { status: 401, body: { error: error.message } }
    } else if (error instanceof InvalidRequestError) {
      return { status: 400, body: { error: error.message } }
    }
    logger.error('Failed to manage presenter', { error: JSON.stringify(error) })
    return { status: 500, body: { error: 'Failed to manage presenter' } }
  }
}
