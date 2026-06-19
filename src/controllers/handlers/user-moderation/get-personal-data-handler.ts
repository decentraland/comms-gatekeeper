import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

export async function getPersonalDataHandler(
  context: Pick<
    HandlerContextWithPath<'userModeration' | 'ipModeration' | 'logs', '/users/:address/personal-data'>,
    'components' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { userModeration, ipModeration, logs },
    params: { address }
  } = context

  const logger = logs.getLogger('get-personal-data-handler')

  try {
    const [connectionLogs, banStatus, warnings, ips] = await Promise.all([
      ipModeration.getConnectionLogsByAddress(address),
      userModeration.isPlayerBanned(address),
      userModeration.getPlayerWarnings(address),
      ipModeration.getIpsByAddress(address)
    ])

    // Gather IP bans for any IP associated with this address
    const ipBans = []
    for (const ip of ips) {
      const ipBanStatus = await ipModeration.getIpBanStatus(ip)
      if (ipBanStatus.isBanned && ipBanStatus.ban) {
        ipBans.push(ipBanStatus.ban)
      }
    }

    return {
      status: 200,
      body: {
        data: {
          address: address.toLowerCase(),
          connectionLogs,
          bans: banStatus.isBanned && banStatus.ban ? [banStatus.ban] : [],
          warnings,
          ipBans
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error getting personal data for address ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
