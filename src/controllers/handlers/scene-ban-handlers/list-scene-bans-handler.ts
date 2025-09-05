import { InvalidRequestError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'

export async function listSceneBansHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneBans' | 'config', '/scene-bans'>,
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

  const bans = await sceneBans.listSceneBans(authenticatedAddress.toLowerCase(), {
    sceneId,
    parcel,
    realmName,
    isWorlds
  })

  return {
    status: 200,
    body: {
      bans
    }
  }
}
