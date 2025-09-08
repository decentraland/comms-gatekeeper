import { InvalidRequestError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { IHttpServerComponent } from '@well-known-components/interfaces'

export async function listSceneBansAddressesHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneBans' | 'config', '/scene-bans/addresses'>,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { sceneBans },
    verification
  } = ctx

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const {
    sceneId,
    parcel,
    realm: { serverName: realmName },
    isWorld: isWorld
  } = await validate(ctx)
  const authenticatedAddress = verification.auth

  const bannedAddresses = await sceneBans.listSceneBannedAddresses(authenticatedAddress, {
    sceneId,
    parcel,
    realmName,
    isWorld
  })

  // Return only the banned addresses array directly
  return {
    status: 200,
    body: {
      data: bannedAddresses,
      total: bannedAddresses.length
    }
  }
}
