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

  async function resolveUserScenePermissions(place: PlaceAttributes, address: string): Promise<UserScenePermissions> {
    const isOwner = await isSceneOwner(place, address)
    const isAdmin = await sceneAdminManager.isAdmin(place.id, address)
    let hasExtendedPermissions = false
    if (!isAdmin && place.world) {
      hasExtendedPermissions =
        (await hasWorldStreamingPermission(address, place.world_name!)) ||
        (await hasWorldDeployPermission(address, place.world_name!))
    } else if (!isAdmin && !place.world) {
      hasExtendedPermissions = (await getLandUpdatePermission(address, place.positions)).operator
    }
    return {
      owner: isOwner,
      admin: isAdmin,
      hasExtendedPermissions
    }
  }

  return {
    isSceneOwner,
    resolveUserScenePermissions
  }
}
