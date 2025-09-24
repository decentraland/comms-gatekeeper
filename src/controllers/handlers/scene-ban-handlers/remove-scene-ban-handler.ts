import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'

export async function removeSceneBanHandler(
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

  let body: { banned_address?: string; banned_name?: string }

  try {
    body = await request.json()
  } catch (error) {
    throw new InvalidRequestError(`Invalid request body`)
  }

  const bannedAddress = body.banned_address
  const bannedName = body.banned_name

  if (!bannedAddress && !bannedName) {
    throw new InvalidRequestError(`Invalid request body, missing banned_address or banned_name`)
  } else if (bannedAddress && !EthAddress.validate(bannedAddress)) {
    throw new InvalidRequestError(`Invalid request body, invalid banned_address`)
  }

  const {
    sceneId,
    parcel,
    realm: { serverName: realmName },
    isWorld: isWorld
  } = await validate(ctx)
  const authenticatedAddress = verification.auth

  await sceneBans.removeSceneBan({ bannedAddress, bannedName }, authenticatedAddress.toLowerCase(), {
    sceneId,
    parcel,
    realmName,
    isWorld
  })

  return {
    status: 204
  }
}
