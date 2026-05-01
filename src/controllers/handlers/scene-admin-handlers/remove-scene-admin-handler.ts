import { EthAddress } from '@dcl/schemas'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { validate } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'

export async function removeSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'sceneAdminManager' | 'logs' | 'config' | 'fetch' | 'sceneManager' | 'places' | 'roomMetadataSync' | 'livekit',
      '/scene-admin'
    >,
    'components' | 'url' | 'params' | 'verification' | 'request'
  >
) {
  const {
    components: { logs, sceneAdminManager, sceneManager, places, roomMetadataSync, livekit },
    request,
    verification
  } = ctx

  const { getWorldScenePlace, getPlaceByParcel } = places
  const { getUserScenePermissions, isSceneOwnerOrAdmin } = sceneManager
  const logger = logs.getLogger('remove-scene-admin-handler')

  if (!verification?.auth) {
    throw new UnauthorizedError('Authentication required')
  }

  const payload = await request.json()

  if (!payload.admin) {
    logger.warn(`Invalid scene admin payload`, payload)
    throw new InvalidRequestError(`Invalid payload`)
  }

  if (!EthAddress.validate(payload.admin)) {
    throw new UnauthorizedError('Invalid admin address')
  }

  // Normalize once: the scene_admin table and the LiveKit metadata `sceneAdmins`
  // array both store lowercase addresses, but the request can arrive checksum-cased.
  const adminToRemove = payload.admin.toLowerCase()

  const {
    sceneId,
    parcel,
    realm: { hostname, serverName }
  } = await validate(ctx)
  const isWorld = hostname.includes('worlds-content-server')
  const authenticatedAddress = verification.auth.toLowerCase()

  let place: PlaceAttributes
  if (isWorld) {
    place = await getWorldScenePlace(serverName, parcel)
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

  // Compute the room name before mutating the DB so a malformed-params throw
  // cannot leave the DB and LiveKit metadata out of sync.
  const roomName = livekit.getRoomName(serverName, { isWorld, sceneId })

  await sceneAdminManager.removeAdmin(place.id, adminToRemove)

  await roomMetadataSync.removeAdmin(roomName, adminToRemove)

  return {
    status: 204
  }
}
