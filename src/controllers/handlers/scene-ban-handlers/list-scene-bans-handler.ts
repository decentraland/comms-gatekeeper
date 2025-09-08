import { InvalidRequestError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { IHttpServerComponent } from '@well-known-components/interfaces'

export async function listSceneBansHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneBans' | 'config', '/scene-bans'>,
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

  const bannedAddressesWithNames = await sceneBans.listSceneBans(authenticatedAddress, {
    sceneId,
    parcel,
    realmName,
    isWorld
  })

  return {
    status: 200,
    body: {
      data: bannedAddressesWithNames,
      total: bannedAddressesWithNames.length
    }
  }
}
