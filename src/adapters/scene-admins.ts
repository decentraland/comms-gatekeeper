import { AppComponents, SceneAdmin } from '../types'
import { ISceneAdmins } from '../types/scene.type'
import { PlaceSummary } from '../types/places.type'
import { PermissionType } from '../types/worlds.type'
import { LandsParcelOperatorsResponse } from './lands'

export async function createSceneAdminsComponent(
  components: Pick<AppComponents, 'worlds' | 'lands' | 'sceneAdminManager' | 'places'>
): Promise<ISceneAdmins> {
  const { worlds, lands, sceneAdminManager, places } = components
  const { fetchWorldActionPermissions, getWorldParcelPermissionAddresses } = worlds
  const { getLandOperators } = lands

  async function getAdminsAndExtraAddresses(
    place: PlaceSummary,
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

      const [positions, worldPermissions] = await Promise.all([
        place.positions ?? places.getPlaceById(place.id).then((fullPlace) => fullPlace.positions),
        fetchWorldActionPermissions(worldName)
      ])

      if (worldPermissions?.owner) {
        extraAddresses.add(worldPermissions.owner.toLowerCase())
      }

      try {
        const [deploymentAddresses, streamingAddresses] = await Promise.all([
          getWorldParcelPermissionAddresses(worldName, 'deployment', positions),
          getWorldParcelPermissionAddresses(worldName, 'streaming', positions)
        ])
        for (const addr of deploymentAddresses) extraAddresses.add(addr.toLowerCase())
        for (const addr of streamingAddresses) extraAddresses.add(addr.toLowerCase())
      } catch {
        if (worldPermissions?.permissions.deployment.type === PermissionType.AllowList) {
          for (const wallet of worldPermissions.permissions.deployment.wallets) {
            extraAddresses.add(wallet.toLowerCase())
          }
        }
        if (worldPermissions?.permissions.streaming.type === PermissionType.AllowList) {
          for (const wallet of worldPermissions.permissions.streaming.wallets) {
            extraAddresses.add(wallet.toLowerCase())
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
