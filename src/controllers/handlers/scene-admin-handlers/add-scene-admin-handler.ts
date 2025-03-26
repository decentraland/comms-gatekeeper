import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { PlaceAttributes } from '../../../types/places.type'

export async function addSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'fetch' | 'sceneAdminManager' | 'logs' | 'config' | 'sceneManager' | 'places',
      '/scene-admin'
    >,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneAdminManager, sceneManager, places },
    request,
    verification
  } = ctx

  const logger = logs.getLogger('add-scene-admin-handler')

  const { getPlaceByWorldName, getPlaceByParcel } = places
  const { resolveUserScenePermissions } = sceneManager

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const payload = await request.json()
  const adminToAdd = payload.admin
  if (!adminToAdd || !EthAddress.validate(adminToAdd)) {
    logger.warn(`Invalid scene admin payload`, payload)
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

  const authenticatedUserScenePermissions = await resolveUserScenePermissions(place, authenticatedAddress)

  if (
    !authenticatedUserScenePermissions.owner &&
    !authenticatedUserScenePermissions.admin &&
    !authenticatedUserScenePermissions.hasExtendedPermissions
  ) {
    throw new UnauthorizedError('You do not have permission to add admins to this place')
  }

  const userToAddScenePermissions = await resolveUserScenePermissions(place, adminToAdd.toLowerCase())

  if (
    userToAddScenePermissions.owner ||
    userToAddScenePermissions.admin ||
    userToAddScenePermissions.hasExtendedPermissions
  ) {
    throw new InvalidRequestError('Cannot add this address as an admin')
  }

  await sceneAdminManager.addAdmin({
    place_id: place.id,
    admin: adminToAdd.toLowerCase(),
    added_by: authenticatedAddress.toLowerCase()
  })

  return {
    status: 204
  }
}
