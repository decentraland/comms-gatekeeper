import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

export async function getAddressesByIpHandler(
  context: Pick<HandlerContextWithPath<'ipModeration' | 'logs', '/ips/:ip/users'>, 'components' | 'params'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { ipModeration, logs },
    params: { ip }
  } = context

  const logger = logs.getLogger('get-addresses-by-ip-handler')

  try {
    const addresses = await ipModeration.getAddressesByIp(ip)

    return {
      status: 200,
      body: {
        data: addresses
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error getting addresses for IP ${ip}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
