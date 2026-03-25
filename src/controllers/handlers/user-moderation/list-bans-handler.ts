import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

export async function listBansHandler(
  context: Pick<HandlerContextWithPath<'userModeration' | 'logs', '/bans'>, 'components'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userModeration, logs }
  } = context

  const logger = logs.getLogger('list-bans-handler')

  try {
    const bans = await userModeration.getActiveBans()

    return {
      status: 200,
      body: {
        data: bans
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error listing active bans: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
