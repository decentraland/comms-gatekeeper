import { InvalidRequestError, NotFoundError, UnauthorizedError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'
import { AddSceneAdminRequestBody } from './schemas'

export async function addSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<
      | 'fetch'
      | 'sceneAdminManager'
      | 'logs'
      | 'config'
      | 'sceneManager'
      | 'places'
      | 'names'
      | 'sceneBans'
      | 'roomMetadataSync'
      | 'livekit',
      '/scene-admin'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { sceneAdminManager, sceneManager, places, names, sceneBans, roomMetadataSync, livekit },
    request,
    verification
  } = ctx

  const { getWorldScenePlace, getPlaceByParcel } = places
  const { getUserScenePermissions, isSceneOwnerOrAdmin } = sceneManager

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const payload: AddSceneAdminRequestBody = await request.json()
  const { admin, name } = payload

  const {
    sceneId,
    parcel,
    realm: { serverName, hostname }
  } = await validate(ctx)

  const isWorld = !!hostname?.includes('worlds-content-server')
  const authenticatedAddress = verification.auth

  let place: PlaceAttributes

  if (isWorld) {
    place = await getWorldScenePlace(serverName, parcel)
  } else {
    place = await getPlaceByParcel(parcel)
  }

  const isOwnerOrAdmin = await isSceneOwnerOrAdmin(place, authenticatedAddress)

  if (!isOwnerOrAdmin) {
    throw new UnauthorizedError('You do not have permission to add admins to this place')
  }

  let adminToAdd: string

  if (admin) {
    adminToAdd = admin.toLowerCase()
  } else {
    const nameOwner = await names.getNameOwner(name!)

    if (!nameOwner) {
      throw new NotFoundError(`Could not find the owner of the name ${name}`)
    }

    adminToAdd = nameOwner.toLowerCase()
  }

  const userToAddScenePermissions = await getUserScenePermissions(place, adminToAdd)

  if (
    userToAddScenePermissions.owner ||
    userToAddScenePermissions.admin ||
    userToAddScenePermissions.hasExtendedPermissions
  ) {
    throw new InvalidRequestError('Cannot add this address as an admin')
  }

  const isBanned = await sceneBans.isUserBanned(adminToAdd, {
    sceneId: sceneId,
    parcel: parcel,
    realmName: serverName,
    isWorld: isWorld
  })

  if (isBanned) {
    throw new InvalidRequestError('Cannot add this address as an admin because it is banned from this scene')
  }

  // Compute the room name before mutating the DB so a malformed-params throw
  // cannot leave the DB and LiveKit metadata out of sync.
  const roomName = livekit.getRoomName(serverName, { isWorld, sceneId })

  await sceneAdminManager.addAdmin({
    place_id: place.id,
    admin: adminToAdd,
    added_by: authenticatedAddress.toLowerCase()
  })

  await roomMetadataSync.addAdmin(roomName, adminToAdd)

  return {
    status: 204
  }
}
