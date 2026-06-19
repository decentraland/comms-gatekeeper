import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

export async function ipBanStatusHandler(
  context: Pick<HandlerContextWithPath<'ipModeration' | 'logs', '/ips/:ip/bans'>, 'components' | 'params'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { ipModeration, logs },
    params: { ip }
  } = context

  const logger = logs.getLogger('ip-ban-status-handler')

  try {
    const banStatus = await ipModeration.getIpBanStatus(ip)

    return {
      status: 200,
      body: {
        data: banStatus
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error getting ban status for IP ${ip}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
