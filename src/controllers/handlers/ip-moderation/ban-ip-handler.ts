import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { BanIpRequestBody } from './schemas'

export async function banIpHandler(
  context: Pick<
    HandlerContextWithPath<'ipModeration' | 'logs', '/ips/:ip/bans'>,
    'components' | 'params' | 'verification' | 'request'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { ipModeration, logs },
    params: { ip },
    verification,
    request
  } = context

  const logger = logs.getLogger('ban-ip-handler')

  try {
    const body = (await request.json()) as BanIpRequestBody
    const bannedBy = verification!.auth

    const ban = await ipModeration.banIp(ip, bannedBy, body.reason, body.duration, body.customMessage)

    if (body.banAllKnownAddresses) {
      await ipModeration.banAllAddressesForIp(ip, bannedBy, body.reason)
    }

    return {
      status: 201,
      body: {
        data: ban
      }
    }
  } catch (error) {
    if (error instanceof Error && error.constructor.name === 'IpAlreadyBannedError') {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error banning IP ${ip}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
