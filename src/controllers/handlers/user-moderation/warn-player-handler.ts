import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { WarnPlayerRequestBody } from './schemas'

export async function warnPlayerHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'logs', '/users/:address/warnings'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userModeration, logs },
    params: { address },
    verification,
    request
  } = context

  const logger = logs.getLogger('warn-player-handler')

  try {
    const body = (await request.json()) as WarnPlayerRequestBody
    const warnedBy = verification!.auth

    const warning = await userModeration.warnPlayer(address, body.reason, warnedBy)

    return {
      status: 201,
      body: {
        data: warning
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error warning player ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
