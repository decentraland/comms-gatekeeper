import { AppComponents } from '../types'
import { ISceneManager, UserScenePermissions } from '../types/scene-manager.type'
import { PlaceAttributes } from '../types/places.type'

export async function createSceneManagerComponent(
  components: Pick<AppComponents, 'worlds' | 'lands' | 'sceneAdminManager'>
): Promise<ISceneManager> {
  const { worlds, lands, sceneAdminManager } = components

  const { hasWorldOwnerPermission, hasWorldStreamingPermission, hasWorldDeployPermission, getWorldParcelPermissions } =
    worlds
  const { getLandPermissions } = lands

  async function isSceneOwner(
    place: PlaceAttributes,
    address: string,
    options?: { skipCache?: boolean }
  ): Promise<boolean> {
    const isWorld = place.world
    if (isWorld) {
      return await hasWorldOwnerPermission(address, place.world_name!, options)
    }
    const landParcelPermission = await getLandPermissions(address, place.positions, options)
    return landParcelPermission?.owner
  }

  async function getUserScenePermissions(
    place: PlaceAttributes,
    address: string,
    options?: { skipCache?: boolean }
  ): Promise<UserScenePermissions> {
    const landParcelPermission = place.world ? undefined : await getLandPermissions(address, place.positions, options)
    const isOwner = place.world ? await isSceneOwner(place, address, options) : landParcelPermission?.owner
    const isAdmin = await sceneAdminManager.isAdmin(place.id, address)
    let hasExtendedPermissions = false
    let hasLandLease = false

    if (!isAdmin && place.world) {
      const [hasWorldStreaming, hasWorldDeploy, streamingParcels, deployParcels] = await Promise.all([
        hasWorldStreamingPermission(address, place.world_name!, options),
        hasWorldDeployPermission(address, place.world_name!, options),
        getWorldParcelPermissions(address, place.world_name!, 'streaming', options),
        getWorldParcelPermissions(address, place.world_name!, 'deployment', options)
      ])
      const streamingParcelList = streamingParcels ?? []
      const deployParcelList = deployParcels ?? []

      const sceneParcels = new Set(place.positions)

      // World-wide permission: in allow list + no specific parcels = applies to all scenes
      const hasWorldWideStreaming =
        hasWorldStreaming && streamingParcels !== undefined && streamingParcelList.length === 0
      const hasWorldWideDeploy = hasWorldDeploy && deployParcels !== undefined && deployParcelList.length === 0

      // Parcel-specific permission: parcels overlap with this scene's positions
      const hasParcelStreaming = streamingParcelList.some((p) => sceneParcels.has(p))
      const hasParcelDeploy = deployParcelList.some((p) => sceneParcels.has(p))

      hasExtendedPermissions = hasWorldWideStreaming || hasWorldWideDeploy || hasParcelStreaming || hasParcelDeploy
    } else if (!isAdmin && !place.world) {
      hasExtendedPermissions =
        landParcelPermission.operator ||
        landParcelPermission.updateOperator ||
        landParcelPermission.updateManager ||
        landParcelPermission.approvedForAll

      // Check for land lease permissions for Genesis City scenes
      if (!isOwner && !hasExtendedPermissions) {
        hasLandLease = await lands.hasLandLease(address, place.positions, options)
      }
    }

    return {
      owner: isOwner,
      admin: isAdmin,
      hasExtendedPermissions,
      hasLandLease
    }
  }

  async function isSceneOwnerOrAdmin(
    place: PlaceAttributes,
    authenticatedAddress: string,
    options?: { skipCache?: boolean }
  ): Promise<boolean> {
    const authenticatedUserScenePermissions = await getUserScenePermissions(place, authenticatedAddress, options)

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
