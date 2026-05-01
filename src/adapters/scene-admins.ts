import { AppComponents, SceneAdmin } from '../types'
import { ISceneAdmins } from '../types/scene.type'
import { PlaceAttributes } from '../types/places.type'
import { PermissionType } from '../types/worlds.type'
import { LandsParcelOperatorsResponse } from './lands'

export async function createSceneAdminsComponent(
  components: Pick<AppComponents, 'worlds' | 'lands' | 'sceneAdminManager'>
): Promise<ISceneAdmins> {
  const { worlds, lands, sceneAdminManager } = components
  const { fetchWorldActionPermissions, getWorldParcelPermissionAddresses } = worlds
  const { getLandOperators } = lands

  async function getAdminsAndExtraAddresses(
    place: Pick<PlaceAttributes, 'id' | 'world' | 'world_name' | 'base_position' | 'positions'>,
    admin?: string
  ): Promise<{
    admins: Set<SceneAdmin>
    extraAddresses: Set<string>
    addresses: Set<string>
  }> {
    const sceneAdminFilters = {
      place_id: place.id,
      admin: admin
    }

    const admins = await sceneAdminManager.listActiveAdmins(sceneAdminFilters)

    const extraAddresses = new Set<string>()
    let landActionPermissions: LandsParcelOperatorsResponse | undefined

    if (place.world) {
      const worldName = place.world_name!

      try {
        const [deploymentAddresses, streamingAddresses, worldPermissions] = await Promise.all([
          getWorldParcelPermissionAddresses(worldName, 'deployment', place.positions),
          getWorldParcelPermissionAddresses(worldName, 'streaming', place.positions),
          fetchWorldActionPermissions(worldName)
        ])
        for (const addr of deploymentAddresses) extraAddresses.add(addr.toLowerCase())
        for (const addr of streamingAddresses) extraAddresses.add(addr.toLowerCase())
        if (worldPermissions?.owner) {
          extraAddresses.add(worldPermissions.owner.toLowerCase())
        }
      } catch {
        // Bulk endpoint not available yet, fall back to all allow-listed wallets
        const permissions = await fetchWorldActionPermissions(worldName)
        if (permissions) {
          if (permissions.permissions.deployment.type === PermissionType.AllowList) {
            for (const wallet of permissions.permissions.deployment.wallets) {
              extraAddresses.add(wallet.toLowerCase())
            }
          }
          if (permissions.permissions.streaming.type === PermissionType.AllowList) {
            for (const wallet of permissions.permissions.streaming.wallets) {
              extraAddresses.add(wallet.toLowerCase())
            }
          }
          if (permissions.owner) {
            extraAddresses.add(permissions.owner.toLowerCase())
          }
        }
      }
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
