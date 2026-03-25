import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

export async function getWarningsHandler(
  context: Pick<HandlerContextWithPath<'userModeration' | 'logs', '/users/:address/warnings'>, 'components' | 'params'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userModeration, logs },
    params: { address }
  } = context

  const logger = logs.getLogger('get-warnings-handler')

  try {
    const warnings = await userModeration.getPlayerWarnings(address)

    return {
      status: 200,
      body: {
        data: warnings
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error getting warnings for player ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
