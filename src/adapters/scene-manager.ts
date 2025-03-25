import { AppComponents } from '../types'
import { ISceneManager } from '../types/scene-manager.type'
import { PlaceAttributes } from '../types/places.type'

export async function createSceneManagerComponent(
  components: Pick<AppComponents, 'worlds' | 'lands' | 'sceneAdminManager'>
): Promise<ISceneManager> {
  const { worlds, lands, sceneAdminManager } = components

  const { hasWorldOwnerPermission, hasWorldStreamingPermission, hasWorldDeployPermission } = worlds
  const { hasLandUpdatePermission } = lands

  async function isSceneOwner(place: PlaceAttributes, address: string): Promise<boolean> {
    const isWorlds = place.world
    if (isWorlds) {
      return await hasWorldOwnerPermission(address, place.world_name!)
    }

    return await hasLandUpdatePermission(address, place.positions)
  }

  async function hasPermissionPrivilege(place: PlaceAttributes, address: string): Promise<boolean> {
    const isOwner = await isSceneOwner(place, address)
    let isAdmin = await sceneAdminManager.isAdmin(place.id, address)
    if (!isAdmin && place.world) {
      isAdmin =
        (await hasWorldStreamingPermission(address, place.world_name!)) ||
        (await hasWorldDeployPermission(address, place.world_name!))
    }

    return isOwner || isAdmin
  }

  return {
    isSceneOwner,
    hasPermissionPrivilege
  }
}
