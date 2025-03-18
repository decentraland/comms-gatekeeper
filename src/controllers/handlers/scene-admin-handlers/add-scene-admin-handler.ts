import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError, UnauthorizedError } from '../../../types'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'

export async function addSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneAdminManager' | 'sceneFetcher' | 'logs' | 'config', '/scene-admin'>,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
) {
  const {
    components: { logs, sceneAdminManager, sceneFetcher },
    request,
    verification
  } = ctx

  const { getPlace, hasLandPermission, hasWorldOwnerPermission } = sceneFetcher

  const logger = logs.getLogger('add-scene-admin-handler')

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

  const isOwner = isWorlds
    ? await hasWorldOwnerPermission(authenticatedAddress, place.world_name!)
    : await hasLandPermission(authenticatedAddress, place.positions)

  const hasStreamPermissionsOnWorld =
    isWorlds && (await sceneFetcher.hasWorldStreamingPermission(authenticatedAddress, realmName))

  let isAdmin = false
  if (hasStreamPermissionsOnWorld) {
    isAdmin = true
  } else {
    isAdmin = await sceneAdminManager.isAdmin(place.id, authenticatedAddress)
  }

  if (!isOwner && !isAdmin) {
    throw new UnauthorizedError('You do not have permission to add admins to this place')
  }

  if (place.owner && place.owner.toLowerCase() === adminToAdd.toLowerCase()) {
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
