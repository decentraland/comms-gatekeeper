import { EthAddress } from '@dcl/schemas'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { FeatureFlag } from '../../adapters/feature-flags'
import { IModeratorComponent } from './types'
import { AppComponents } from '../../types'

export async function createModeratorComponent({
  featureFlags,
  logs,
  config
}: Pick<AppComponents, 'featureFlags' | 'logs' | 'config'>): Promise<IModeratorComponent> {
  const logger = logs.getLogger('moderator-component')
  const moderatorToken = await config.getString('MODERATOR_TOKEN')

  async function getModeratorAddresses(): Promise<string[]> {
    const addresses = (await featureFlags.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)) || []

    const trimmedAddresses = addresses.map((address) => address.trim().toLowerCase())

    for (const address of trimmedAddresses) {
      if (address.length > 0 && !EthAddress.validate(address)) {
        logger.warn(`Filtering out invalid moderator address: ${address}`)
      }
    }

    return trimmedAddresses.filter(EthAddress.validate)
  }

  async function moderatorAuthMiddleware(
    context: IHttpServerComponent.DefaultContext<object> & {
      verification?: { auth?: string }
      url: URL
    },
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse> {
    // Token-based auth: check Bearer token against MODERATOR_TOKEN
    if (moderatorToken) {
      const authorization = context.request.headers.get('authorization')
      if (authorization === `Bearer ${moderatorToken}`) {
        const moderatorName = context.url.searchParams.get('moderator')
        if (!moderatorName) {
          return {
            status: 400,
            body: { error: 'Missing moderator query parameter' }
          }
        }

        context.verification = { auth: moderatorName }
        return next()
      }
    }

    // Wallet-based auth: check verification.auth against moderator allowlist
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
