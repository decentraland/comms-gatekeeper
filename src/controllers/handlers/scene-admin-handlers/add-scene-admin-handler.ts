import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError, UnauthorizedError } from '../../../types'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'

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

  const { getPlace } = places
  const { isSceneOwner, hasPermissionPrivilege } = sceneManager

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const payload = await request.json()
  const adminToAdd = payload.admin
  if (!adminToAdd || !EthAddress.validate(adminToAdd)) {
    logger.warn(`Invalid scene admin payload`, payload)
    throw new InvalidRequestError(`Invalid payload`)
  }

  const { parcel, hostname, realmName } = await validate(ctx)
  const isWorlds = !!hostname?.includes('worlds-content-server')
  const authenticatedAddress = verification.auth
  const place = await getPlace(isWorlds, realmName, parcel)

  const canAdd = await hasPermissionPrivilege(place, authenticatedAddress)
  if (!canAdd) {
    throw new UnauthorizedError('You do not have permission to add admins to this place')
  }

  const isAddingOwnerAsAdmin = await isSceneOwner(place, adminToAdd.toLowerCase())

  if (isAddingOwnerAsAdmin) {
    throw new InvalidRequestError('Cannot add the owner as an admin')
  }

  const isAlreadyAdmin = await sceneAdminManager.isAdmin(place.id, adminToAdd)
  if (isAlreadyAdmin) {
    throw new InvalidRequestError('This address is already an admin')
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
