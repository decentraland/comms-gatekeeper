import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { EthAddress } from '@dcl/schemas'
import { IHttpServerComponent, IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { IModeratorComponent } from './types'

export async function createModeratorComponent({
  config,
  logs
}: {
  config: IConfigComponent
  logs: ILoggerComponent
}): Promise<IModeratorComponent> {
  const logger = logs.getLogger('moderator-component')

  async function getModeratorAddresses(): Promise<string[]> {
    const allowlist = (await config.getString('MODERATORS_ALLOWLIST')) || ''

    const addresses = allowlist
      .split(',')
      .map((address) => address.trim().toLowerCase())
      .filter((address) => address.length > 0)

    for (const address of addresses) {
      if (!EthAddress.validate(address)) {
        logger.warn(`Filtering out invalid moderator address: ${address}`)
      }
    }

    return addresses.filter(EthAddress.validate)
  }

  async function moderatorAuthMiddleware(
    context: IHttpServerComponent.DefaultContext<object> & DecentralandSignatureContext<any>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse> {
    const { verification } = context
    const address = verification?.auth?.toLowerCase()

    const moderatorAddresses = await getModeratorAddresses()

    if (!EthAddress.validate(address) || !moderatorAddresses.includes(address)) {
      return {
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      }
    }

    return next()
  }

  return { moderatorAuthMiddleware }
}
