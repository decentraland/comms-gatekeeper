import { AppComponents, SceneAdmin } from '../types'
import { ISceneAdmins } from '../types/scene.type'
import { PlaceAttributes } from '../types/places.type'
import { PermissionType } from '../types/worlds.type'
import { PermissionsOverWorld } from '../types/worlds.type'
import { LandsParcelOperatorsResponse } from '../types/lands.type'

export async function createSceneAdminsComponent(
  components: Pick<AppComponents, 'worlds' | 'lands' | 'sceneAdminManager'>
): Promise<ISceneAdmins> {
  async function getAdminsAndExtraAddresses(
    place: Pick<PlaceAttributes, 'id' | 'world' | 'world_name' | 'base_position' | 'positions'>,
    admin?: string
  ): Promise<{
    admins: Set<SceneAdmin>
    extraAddresses: Set<string>
    addresses: Set<string>
  }> {
    const { worlds, lands, sceneAdminManager } = components

    const { fetchWorldActionPermissions, getWorldParcelPermissions } = worlds
    const { getLandOperators } = lands

    const sceneAdminFilters = {
      place_id: place.id,
      admin: admin
    }

    const admins = await sceneAdminManager.listActiveAdmins(sceneAdminFilters)

    const extraAddresses = new Set<string>()
    let worldActionPermissions: PermissionsOverWorld | undefined
    let landActionPermissions: LandsParcelOperatorsResponse | undefined

    if (place.world) {
      worldActionPermissions = await fetchWorldActionPermissions(place.world_name!)
    } else {
      landActionPermissions = await getLandOperators(place.base_position)
    }

    if (landActionPermissions) {
      extraAddresses.add(landActionPermissions.owner.toLowerCase())
      if (landActionPermissions.operator) {
        extraAddresses.add(landActionPermissions.operator.toLowerCase())
      }
      if (landActionPermissions.updateOperator) {
        extraAddresses.add(landActionPermissions.updateOperator.toLowerCase())
      }
      landActionPermissions.updateManagers.forEach((operator) => extraAddresses.add(operator.toLowerCase()))
      landActionPermissions.approvedForAll.forEach((operator) => extraAddresses.add(operator.toLowerCase()))
    }

    if (worldActionPermissions) {
      const sceneParcels = new Set(place.positions)

      if (worldActionPermissions.permissions.deployment.type === PermissionType.AllowList) {
        for (const wallet of worldActionPermissions.permissions.deployment.wallets) {
          const parcels = await getWorldParcelPermissions(wallet, place.world_name!, 'deployment')
          // World-wide permission (empty parcels) or scene-specific permission (parcels overlap)
          if (parcels.length === 0 || parcels.some((p) => sceneParcels.has(p))) {
            extraAddresses.add(wallet.toLowerCase())
          }
        }
      }

      if (worldActionPermissions.permissions.streaming.type === PermissionType.AllowList) {
        for (const wallet of worldActionPermissions.permissions.streaming.wallets) {
          const parcels = await getWorldParcelPermissions(wallet, place.world_name!, 'streaming')
          if (parcels.length === 0 || parcels.some((p) => sceneParcels.has(p))) {
            extraAddresses.add(wallet.toLowerCase())
          }
        }
      }

      const ownerAddress = worldActionPermissions.owner
      if (ownerAddress) {
        extraAddresses.add(ownerAddress.toLowerCase())
      }
    }

    return {
      admins: new Set(admins),
      extraAddresses,
      addresses: new Set([...admins.map((admin) => admin.admin), ...extraAddresses])
    }
  }

  return {
    getAdminsAndExtraAddresses
  }
}
