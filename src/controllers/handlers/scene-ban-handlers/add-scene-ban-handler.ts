import { InvalidRequestError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { AddSceneBanRequest } from './schemas'

export async function addSceneBanHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneBans' | 'config', '/scene-bans'>,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { sceneBans },
    request,
    verification
  } = ctx

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const body: AddSceneBanRequest = await request.json()

  const { banned_address: bannedAddress, banned_name: bannedName } = body

  const {
    sceneId,
    parcel,
    realm: { serverName: realmName },
    isWorld: isWorld
  } = await validate(ctx)
  const authenticatedAddress = verification.auth

  if (bannedAddress) {
    await sceneBans.addSceneBan(bannedAddress, authenticatedAddress.toLowerCase(), {
      sceneId,
      parcel,
      realmName,
      isWorld
    })
  } else if (bannedName) {
    await sceneBans.addSceneBanByName(bannedName, authenticatedAddress.toLowerCase(), {
      sceneId,
      parcel,
      realmName,
      isWorld
    })
  }

  return {
    status: 204
  }
}
