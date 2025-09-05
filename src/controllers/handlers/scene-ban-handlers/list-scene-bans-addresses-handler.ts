import { InvalidRequestError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'

export async function listSceneBansAddressesHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneBans' | 'config', '/scene-bans/addresses'>,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
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
    isWorlds
  } = await validate(ctx)
  const authenticatedAddress = verification.auth

  const bannedAddresses = await sceneBans.listSceneBannedAddresses(authenticatedAddress.toLowerCase(), {
    sceneId,
    parcel,
    realmName,
    isWorlds
  })

  // Return only the banned addresses
  return {
    status: 200,
    body: {
      bannedAddresses
    }
  }
}
