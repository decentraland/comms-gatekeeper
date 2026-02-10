import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { validate } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'

export async function removeSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'sceneAdminManager' | 'logs' | 'config' | 'fetch' | 'sceneManager' | 'places',
      '/scene-admin'
    >,
    'components' | 'url' | 'params' | 'verification' | 'request'
  >
) {
  const {
    components: { logs, sceneAdminManager, sceneManager, places },
    request,
    verification
  } = ctx

  const { getWorldByName, getPlaceByParcel } = places
  const { getUserScenePermissions, isSceneOwnerOrAdmin } = sceneManager
  const logger = logs.getLogger('remove-scene-admin-handler')

  if (!verification?.auth) {
    throw new UnauthorizedError('Authentication required')
  }

  const payload = await request.json()

  const adminToRemove = payload.admin

  if (!adminToRemove) {
    logger.warn(`Invalid scene admin payload`, payload)
    throw new InvalidRequestError(`Invalid payload`)
  }

  const {
    parcel,
    realm: { hostname, serverName }
  } = await validate(ctx)
  const isWorld = hostname.includes('worlds-content-server')
  const authenticatedAddress = verification.auth.toLowerCase()

  if (!EthAddress.validate(adminToRemove)) {
    throw new UnauthorizedError('Invalid admin address')
  }

  let place: PlaceAttributes
  if (isWorld) {
    // For worlds: use getWorldByName (world-wide admin management)
    place = await getWorldByName(serverName)
  } else {
    place = await getPlaceByParcel(parcel)
  }
  if (!place) {
    throw new InvalidRequestError('Place not found')
  }

  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(place, authenticatedAddress)
  if (!isOwnerOrAdmin) {
    logger.warn(`User ${authenticatedAddress} is not authorized to remove admins for entity ${place.id}`)
    throw new UnauthorizedError('Only scene admins or the owner can remove admins')
  }

  const userToRemoveScenePermissions = await getUserScenePermissions(place, adminToRemove)

  if (userToRemoveScenePermissions.owner || userToRemoveScenePermissions.hasExtendedPermissions) {
    logger.warn(`Attempt to remove ${adminToRemove} from entity ${place.id} by ${authenticatedAddress}`)
    throw new InvalidRequestError('Cannot remove the user with privileges from this scene')
  }

  if (!userToRemoveScenePermissions.admin) {
    throw new InvalidRequestError('The specified admin does not exist or is already inactive')
  }

  await sceneAdminManager.removeAdmin(place.id, adminToRemove)
  return {
    status: 204
  }
}
