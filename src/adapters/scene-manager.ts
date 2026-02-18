import { AppComponents } from '../types'
import { ISceneManager, UserScenePermissions } from '../types/scene-manager.type'
import { PlaceAttributes } from '../types/places.type'

export async function createSceneManagerComponent(
  components: Pick<AppComponents, 'worlds' | 'lands' | 'sceneAdminManager' | 'landLease'>
): Promise<ISceneManager> {
  const { worlds, lands, sceneAdminManager, landLease } = components

  const { hasWorldOwnerPermission, hasWorldStreamingPermission, hasWorldDeployPermission, getWorldParcelPermissions } =
    worlds
  const { getLandPermissions } = lands

  async function isSceneOwner(place: PlaceAttributes, address: string): Promise<boolean> {
    const isWorld = place.world
    if (isWorld) {
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
      const [hasWorldStreaming, hasWorldDeploy, streamingParcels, deployParcels] = await Promise.all([
        hasWorldStreamingPermission(address, place.world_name!),
        hasWorldDeployPermission(address, place.world_name!),
        getWorldParcelPermissions(address, place.world_name!, 'streaming'),
        getWorldParcelPermissions(address, place.world_name!, 'deployment')
      ])

      const sceneParcels = new Set(place.positions)

      // World-wide permission: in allow list + no specific parcels = applies to all scenes
      const hasWorldWideStreaming = hasWorldStreaming && streamingParcels.length === 0
      const hasWorldWideDeploy = hasWorldDeploy && deployParcels.length === 0

      // Parcel-specific permission: parcels overlap with this scene's positions
      const hasParcelStreaming = streamingParcels.some((p) => sceneParcels.has(p))
      const hasParcelDeploy = deployParcels.some((p) => sceneParcels.has(p))

      hasExtendedPermissions = hasWorldWideStreaming || hasWorldWideDeploy || hasParcelStreaming || hasParcelDeploy
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
