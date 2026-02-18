import { AppComponents, SceneAdmin } from '../types'
import { ISceneAdmins } from '../types/scene.type'
import { PlaceAttributes } from '../types/places.type'
import { PermissionType } from '../types/worlds.type'
import { PermissionsOverWorld } from '../types/worlds.type'
import { LandsParcelOperatorsResponse } from '../types/lands.type'

export async function createSceneAdminsComponent(
  components: Pick<AppComponents, 'worlds' | 'lands' | 'sceneAdminManager'>
): Promise<ISceneAdmins> {
  const { worlds, lands, sceneAdminManager } = components
  const { fetchWorldActionPermissions, getWorldParcelPermissions } = worlds
  const { getLandOperators } = lands

  /**
   * Resolves which wallets have permission over a scene's parcels within a world.
   * A wallet qualifies if it has world-wide permission (empty parcels from the endpoint)
   * or scene-specific permission (returned parcels overlap with the scene's positions).
   */
  async function resolveWalletsWithPermission(
    wallets: string[],
    worldName: string,
    permissionName: string,
    sceneParcels: Set<string>
  ): Promise<string[]> {
    const results = await Promise.all(
      wallets.map(async (wallet) => {
        const parcels = await getWorldParcelPermissions(wallet, worldName, permissionName)
        const hasPermission = parcels.length === 0 || parcels.some((p) => sceneParcels.has(p))
        return hasPermission ? wallet.toLowerCase() : null
      })
    )
    return results.filter((w): w is string => w !== null)
  }

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

      const deploymentWallets =
        worldActionPermissions.permissions.deployment.type === PermissionType.AllowList
          ? worldActionPermissions.permissions.deployment.wallets
          : []
      const streamingWallets =
        worldActionPermissions.permissions.streaming.type === PermissionType.AllowList
          ? worldActionPermissions.permissions.streaming.wallets
          : []

      const [deploymentAddresses, streamingAddresses] = await Promise.all([
        resolveWalletsWithPermission(deploymentWallets, place.world_name!, 'deployment', sceneParcels),
        resolveWalletsWithPermission(streamingWallets, place.world_name!, 'streaming', sceneParcels)
      ])

      for (const addr of deploymentAddresses) extraAddresses.add(addr)
      for (const addr of streamingAddresses) extraAddresses.add(addr)

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
