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

  let body: { banned_address: string }

  try {
    body = await request.json()
  } catch (error) {
    throw new InvalidRequestError(`Invalid request body`)
  }

  const bannedAddress = body.banned_address

  if (!bannedAddress) {
    throw new InvalidRequestError(`Invalid request body, missing banned_address`)
  } else if (!EthAddress.validate(bannedAddress)) {
    throw new InvalidRequestError(`Invalid request body, invalid banned_address`)
  }

  const {
    sceneId,
    parcel,
    realm: { serverName: realmName },
    isWorlds
  } = await validate(ctx)
  const authenticatedAddress = verification.auth

  await sceneBans.removeSceneBan(bannedAddress.toLowerCase(), authenticatedAddress.toLowerCase(), {
    sceneId,
    parcel,
    realmName,
    isWorlds
  })

  return {
    status: 204
  }
}
