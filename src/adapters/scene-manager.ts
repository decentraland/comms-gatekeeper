import { AppComponents } from '../types'
import { ISceneManager, UserScenePermissions } from '../types/scene-manager.type'
import { PlaceAttributes } from '../types/places.type'

export async function createSceneManagerComponent(
  components: Pick<AppComponents, 'worlds' | 'lands' | 'sceneAdminManager' | 'landLease'>
): Promise<ISceneManager> {
  const { worlds, lands, sceneAdminManager, landLease } = components

  const { hasWorldOwnerPermission, hasWorldStreamingPermission, hasWorldDeployPermission } = worlds
  const { getLandPermissions } = lands

  async function isSceneOwner(place: PlaceAttributes, address: string): Promise<boolean> {
    const isWorlds = place.world
    if (isWorlds) {
      return await hasWorldOwnerPermission(address, place.world_name!)
    }
    const landParcelPermission = await getLandPermissions(address, place.positions)
    return landParcelPermission?.owner
  }

  async function getUserScenePermissions(place: PlaceAttributes, address: string): Promise<UserScenePermissions> {
    const isOwner = await isSceneOwner(place, address)
    const isAdmin = await sceneAdminManager.isAdmin(place.id, address)
    let hasExtendedPermissions = false
    let hasLandLease = false

    if (!isAdmin && place.world) {
      const [hasStreamingPermission, hasDeployPermission] = await Promise.all([
        hasWorldStreamingPermission(address, place.world_name!),
        hasWorldDeployPermission(address, place.world_name!)
      ])
      hasExtendedPermissions = hasStreamingPermission || hasDeployPermission
    } else if (!isAdmin && !place.world) {
      const landParcelPermission = await getLandPermissions(address, place.positions)
      hasExtendedPermissions =
        landParcelPermission.operator ||
        landParcelPermission.updateOperator ||
        landParcelPermission.updateManager ||
        landParcelPermission.approvedForAll

      // Check for land lease permissions for Genesis City scenes
      if (!isOwner && !hasExtendedPermissions) {
        hasLandLease = await landLease.hasLandLease(address, place.positions)
      }
    }

    return {
      owner: isOwner,
      admin: isAdmin,
      hasExtendedPermissions,
      hasLandLease
    }
  }

  async function isSceneOwnerOrAdmin(place: PlaceAttributes, authenticatedAddress: string): Promise<boolean> {
    const authenticatedUserScenePermissions = await getUserScenePermissions(place, authenticatedAddress)
    return (
      authenticatedUserScenePermissions.owner ||
      authenticatedUserScenePermissions.admin ||
      authenticatedUserScenePermissions.hasExtendedPermissions ||
      authenticatedUserScenePermissions.hasLandLease
    )
  }

  return {
    isSceneOwner,
    getUserScenePermissions,
    isSceneOwnerOrAdmin
  }
}
