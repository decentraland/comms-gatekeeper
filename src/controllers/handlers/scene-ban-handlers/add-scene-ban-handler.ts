import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'

export async function addSceneBanHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneBanManager' | 'logs' | 'config' | 'sceneManager' | 'places', '/scene-bans'>,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneBanManager, sceneManager, places },
    request,
    verification
  } = ctx

  const logger = logs.getLogger('add-scene-ban-handler')

  const { getPlaceByWorldName, getPlaceByParcel } = places
  const { getUserScenePermissions, isSceneOwnerOrAdmin } = sceneManager

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
    parcel,
    realm: { serverName, hostname }
  } = await validate(ctx)
  const isWorlds = !!hostname?.includes('worlds-content-server')
  const authenticatedAddress = verification.auth
  let place: PlaceAttributes

  if (isWorlds) {
    place = await getPlaceByWorldName(serverName)
  } else {
    place = await getPlaceByParcel(parcel)
  }

  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(place, authenticatedAddress)

  if (!isOwnerOrAdmin) {
    throw new UnauthorizedError('You do not have permission to ban users from this place')
  }

  const userToBanScenePermissions = await getUserScenePermissions(place, bannedAddress.toLowerCase())

  if (
    userToBanScenePermissions.owner ||
    userToBanScenePermissions.admin ||
    userToBanScenePermissions.hasExtendedPermissions
  ) {
    throw new InvalidRequestError('Cannot ban this address')
  }

  await sceneBanManager.addBan({
    place_id: place.id,
    banned_address: bannedAddress.toLowerCase(),
    banned_by: authenticatedAddress.toLowerCase()
  })

  return {
    status: 204
  }
}
