import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

export async function getIpsByAddressHandler(
  context: Pick<HandlerContextWithPath<'ipModeration' | 'logs', '/users/:address/ips'>, 'components' | 'params'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { ipModeration, logs },
    params: { address }
  } = context

  const logger = logs.getLogger('get-ips-by-address-handler')

  try {
    const ips = await ipModeration.getIpsByAddress(address)

    return {
      status: 200,
      body: {
        data: ips
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error getting IPs for address ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
