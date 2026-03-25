import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { BanPlayerRequestBody } from './schemas'

export async function banPlayerHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'logs', '/users/:address/bans'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userModeration, logs },
    params: { address },
    verification,
    request
  } = context

  const logger = logs.getLogger('ban-player-handler')

  try {
    const body = (await request.json()) as BanPlayerRequestBody
    const bannedBy = verification!.auth

    const ban = await userModeration.banPlayer(address, bannedBy, body.reason, body.duration, body.customMessage)

    return {
      status: 201,
      body: {
        data: ban
      }
    }
  } catch (error) {
    if (error instanceof Error && error.constructor.name === 'PlayerAlreadyBannedError') {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error banning player ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
