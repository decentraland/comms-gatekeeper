import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

export async function banStatusHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'logs', '/moderation/users/:address/bans'>,
    'components' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userModeration, logs },
    params: { address }
  } = context

  const logger = logs.getLogger('ban-status-handler')

  try {
    const banStatus = await userModeration.isPlayerBanned(address)

    return {
      status: 200,
      body: {
        data: banStatus
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error getting ban status for player ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
