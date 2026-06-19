import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

export async function liftIpBanHandler(
  context: Pick<
    HandlerContextWithPath<'ipModeration' | 'logs', '/ips/:ip/bans'>,
    'components' | 'params' | 'verification'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { ipModeration, logs },
    params: { ip },
    verification
  } = context

  const logger = logs.getLogger('lift-ip-ban-handler')

  try {
    const liftedBy = verification!.auth

    await ipModeration.liftIpBan(ip, liftedBy)

    return { status: 204 }
  } catch (error) {
    if (error instanceof Error && error.constructor.name === 'IpBanNotFoundError') {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error lifting ban for IP ${ip}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
