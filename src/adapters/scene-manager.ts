import { AppComponents } from '../types'
import { ISceneManager, UserScenePermissions } from '../types/scene-manager.type'
import { PlaceAttributes } from '../types/places.type'

export async function createSceneManagerComponent(
  components: Pick<AppComponents, 'worlds' | 'lands' | 'sceneAdminManager'>
): Promise<ISceneManager> {
  const { worlds, lands, sceneAdminManager } = components

  const { hasWorldOwnerPermission, hasWorldStreamingPermission, hasWorldDeployPermission } = worlds
  const { getLandUpdatePermission } = lands

  async function isSceneOwner(place: PlaceAttributes, address: string): Promise<boolean> {
    const isWorlds = place.world
    if (isWorlds) {
      return await hasWorldOwnerPermission(address, place.world_name!)
    }

    return (await getLandUpdatePermission(address, place.positions)).owner
  }

  async function getUserScenePermissions(place: PlaceAttributes, address: string): Promise<UserScenePermissions> {
    const isOwner = await isSceneOwner(place, address)
    const isAdmin = await sceneAdminManager.isAdmin(place.id, address)
    let hasExtendedPermissions = false
    if (!isAdmin && place.world) {
      const [hasStreamingPermission, hasDeployPermission] = await Promise.all([
        hasWorldStreamingPermission(address, place.world_name!),
        hasWorldDeployPermission(address, place.world_name!)
      ])
      hasExtendedPermissions = hasStreamingPermission || hasDeployPermission
    } else if (!isAdmin && !place.world) {
      hasExtendedPermissions = (await getLandUpdatePermission(address, place.positions)).operator
    }
    return {
      owner: isOwner,
      admin: isAdmin,
      hasExtendedPermissions
    }
  }

  async function isSceneOwnerOrAdmin(place: PlaceAttributes, authenticatedAddress: string): Promise<boolean> {
    const authenticatedUserScenePermissions = await getUserScenePermissions(place, authenticatedAddress)
    return (
      authenticatedUserScenePermissions.owner ||
      authenticatedUserScenePermissions.admin ||
      authenticatedUserScenePermissions.hasExtendedPermissions
    )
  }

  return {
    isSceneOwner,
    getUserScenePermissions,
    isSceneOwnerOrAdmin
  }
}
