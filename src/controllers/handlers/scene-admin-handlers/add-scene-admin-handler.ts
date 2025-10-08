import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError, NotFoundError, UnauthorizedError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'

export async function addSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'fetch' | 'sceneAdminManager' | 'logs' | 'config' | 'sceneManager' | 'places' | 'names',
      '/scene-admin'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneAdminManager, sceneManager, places, names },
    request,
    verification
  } = ctx

  const logger = logs.getLogger('add-scene-admin-handler')

  const { getPlaceByWorldName, getPlaceByParcel } = places
  const { getUserScenePermissions, isSceneOwnerOrAdmin } = sceneManager

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const payload: { admin?: string; name?: string } = await request.json()
  const { admin, name } = payload

  if (!admin && !name) {
    logger.warn(`Invalid scene admin payload, missing admin or name`, payload)
    throw new InvalidRequestError(`Invalid payload, missing admin or name`)
  } else if (admin && !EthAddress.validate(admin)) {
    logger.warn(`Invalid scene admin payload, invalid admin address`, payload)
    throw new InvalidRequestError(`Invalid payload, invalid admin address`)
  }

  const {
    parcel,
    realm: { serverName, hostname }
  } = await validate(ctx)
  const isWorld = !!hostname?.includes('worlds-content-server')
  const authenticatedAddress = verification.auth
  let place: PlaceAttributes

  if (isWorld) {
    place = await getPlaceByWorldName(serverName)
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

  await sceneAdminManager.addAdmin({
    place_id: place.id,
    admin: adminToAdd,
    added_by: authenticatedAddress.toLowerCase()
  })

  return {
    status: 204
  }
}
