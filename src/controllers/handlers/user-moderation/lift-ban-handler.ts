import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

export async function liftBanHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'logs', '/moderation/users/:address/bans'>,
    'components' | 'params' | 'verification'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userModeration, logs },
    params: { address },
    verification
  } = context

  const logger = logs.getLogger('lift-ban-handler')

  try {
    const liftedBy = verification!.auth

    await userModeration.liftBan(address, liftedBy)

    return { status: 204 }
  } catch (error) {
    if (error instanceof Error && error.constructor.name === 'BanNotFoundError') {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error lifting ban for player ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
