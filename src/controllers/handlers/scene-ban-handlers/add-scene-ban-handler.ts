import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'

export async function addSceneBanHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneBans' | 'logs' | 'config', '/scene-bans'>,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneBans },
    request,
    verification
  } = ctx

  const logger = logs.getLogger('add-scene-ban-handler')

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const payload = await request.json()
  const bannedAddress = payload.banned_address

  if (!bannedAddress || !EthAddress.validate(bannedAddress)) {
    logger.warn(`Invalid scene ban payload`, payload)
    throw new InvalidRequestError(`Invalid payload`)
  }

  const {
    sceneId,
    parcel,
    realm: { serverName: realmName },
    isWorlds
  } = await validate(ctx)
  const authenticatedAddress = verification.auth

  await sceneBans.addSceneBan(bannedAddress.toLowerCase(), authenticatedAddress.toLowerCase(), {
    sceneId,
    parcel,
    realmName,
    isWorlds
  })

  return {
    status: 204
  }
}
