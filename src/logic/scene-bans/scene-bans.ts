import { AppComponents, SceneBan } from '../../types'
import { AddSceneBanParams, RemoveSceneBanParams, ListSceneBansParams, ISceneBansComponent } from './types'
import { InvalidRequestError, UnauthorizedError } from '../../types/errors'
import { PlaceAttributes } from '../../types/places.type'
import { AnalyticsEvent } from '../../types/analytics'

export function createSceneBansComponent(
  components: Pick<AppComponents, 'sceneBanManager' | 'livekit' | 'logs' | 'sceneManager' | 'places' | 'analytics'>
): ISceneBansComponent {
  const { sceneBanManager, livekit, logs, sceneManager, places, analytics } = components
  const logger = logs.getLogger('scene-bans')

  /**
   * Adds a ban for a user from a scene with permission validation.
   * @param bannedAddress - The address of the user being banned.
   * @param bannedBy - The address of the user performing the ban.
   * @param params - The parameters for the ban.
   */
  async function addSceneBan(bannedAddress: string, bannedBy: string, params: AddSceneBanParams): Promise<void> {
    const { sceneId, realmName, parcel, isWorlds } = params

    logger.debug(`Banning user ${bannedAddress} by user ${bannedBy}`, {
      sceneId: sceneId || '',
      realmName,
      parcel: parcel || '',
      isWorlds: String(isWorlds)
    })

    let place: PlaceAttributes

    if (isWorlds) {
      place = await places.getPlaceByWorldName(realmName)
    } else {
      place = await places.getPlaceByParcel(parcel)
    }

    // Check if the user performing the ban has permission
    const isOwnerOrAdmin = await sceneManager.isSceneOwnerOrAdmin(place, bannedBy)
    if (!isOwnerOrAdmin) {
      throw new UnauthorizedError('You do not have permission to ban users from this place')
    }

    // Check if the user to be banned is a protected user
    const userToBanScenePermissions = await sceneManager.getUserScenePermissions(place, bannedAddress.toLowerCase())
    if (
      userToBanScenePermissions.owner ||
      userToBanScenePermissions.admin ||
      userToBanScenePermissions.hasExtendedPermissions
    ) {
      throw new InvalidRequestError('Cannot ban this address')
    }

    const roomName = livekit.getRoomName(realmName, { isWorlds, sceneId })
    await Promise.all([
      livekit.removeParticipant(roomName, bannedAddress.toLowerCase()).catch((err) => {
        logger.warn(`Error removing participant ${bannedAddress} from LiveKit room ${roomName}`, { err })
      }),
      sceneBanManager.addBan({
        place_id: place.id,
        banned_address: bannedAddress.toLowerCase(),
        banned_by: bannedBy.toLowerCase()
      })
    ])

    logger.info(
      `Successfully banned user ${bannedAddress} for place ${place.id} and removed participant from LiveKit room ${roomName}`
    )

    analytics.fireEvent(AnalyticsEvent.SCENE_BAN_ADDED, {
      place_id: place.id,
      banned_address: bannedAddress.toLowerCase(),
      banned_by: bannedBy.toLowerCase(),
      banned_at: Date.now(),
      scene_id: sceneId,
      parcel: parcel,
      realm_name: realmName
    })
  }

  /**
   * Removes a ban for a user from a scene with permission validation.
   * @param bannedAddress - The address of the user being unbanned.
   * @param unbannedBy - The address of the user performing the unban.
   * @param params - The parameters for the unban.
   */
  async function removeSceneBan(
    bannedAddress: string,
    unbannedBy: string,
    params: RemoveSceneBanParams
  ): Promise<void> {
    const { sceneId, realmName, parcel, isWorlds } = params

    logger.debug(`Unbanning user ${bannedAddress} by user ${unbannedBy}`, {
      sceneId: sceneId || '',
      realmName,
      parcel: parcel || '',
      isWorlds: String(isWorlds)
    })

    let place: PlaceAttributes

    if (isWorlds) {
      place = await places.getPlaceByWorldName(realmName)
    } else {
      place = await places.getPlaceByParcel(parcel)
    }

    // Check if the user performing the unban has permission
    const isOwnerOrAdmin = await sceneManager.isSceneOwnerOrAdmin(place, unbannedBy)
    if (!isOwnerOrAdmin) {
      throw new UnauthorizedError('You do not have permission to unban users from this place')
    }

    await sceneBanManager.removeBan(place.id, bannedAddress.toLowerCase())

    logger.info(`Successfully unbanned user ${bannedAddress} for place ${place.id}`)

    analytics.fireEvent(AnalyticsEvent.SCENE_BAN_REMOVED, {
      place_id: place.id,
      banned_address: bannedAddress.toLowerCase(),
      unbanned_by: unbannedBy.toLowerCase(),
      unbanned_at: Date.now(),
      scene_id: sceneId,
      parcel: parcel,
      realm_name: realmName
    })
  }

  /**
   * Lists all bans for a scene with permission validation.
   * @param requestedBy - The address of the user requesting the list.
   * @param params - The parameters for the list.
   */
  async function listSceneBans(requestedBy: string, params: ListSceneBansParams): Promise<SceneBan[]> {
    const { sceneId, realmName, parcel, isWorlds } = params

    logger.debug(`Listing bans for scene by user ${requestedBy}`, {
      sceneId: sceneId || '',
      realmName,
      parcel: parcel || '',
      isWorlds: String(isWorlds)
    })

    let place: PlaceAttributes

    if (isWorlds) {
      place = await places.getPlaceByWorldName(realmName)
    } else {
      place = await places.getPlaceByParcel(parcel)
    }

    // Check if the user requesting the list has permission
    const isOwnerOrAdmin = await sceneManager.isSceneOwnerOrAdmin(place, requestedBy)
    if (!isOwnerOrAdmin) {
      throw new UnauthorizedError('You do not have permission to list bans for this place')
    }

    const bans = await sceneBanManager.listBans(place.id)

    logger.info(`Successfully listed ${bans.length} bans for place ${place.id}`)

    return bans
  }

  /**
   * Lists only the banned addresses for a scene with permission validation.
   * @param requestedBy - The address of the user requesting the list.
   * @param params - The parameters for the list.
   */
  async function listSceneBannedAddresses(requestedBy: string, params: ListSceneBansParams): Promise<string[]> {
    const { sceneId, realmName, parcel, isWorlds } = params

    logger.debug(`Listing banned addresses for scene by user ${requestedBy}`, {
      sceneId: sceneId || '',
      realmName,
      parcel: parcel || '',
      isWorlds: String(isWorlds)
    })

    let place: PlaceAttributes

    if (isWorlds) {
      place = await places.getPlaceByWorldName(realmName)
    } else {
      place = await places.getPlaceByParcel(parcel)
    }

    // Check if the user requesting the list has permission
    const isOwnerOrAdmin = await sceneManager.isSceneOwnerOrAdmin(place, requestedBy)
    if (!isOwnerOrAdmin) {
      throw new UnauthorizedError('User does not have permission to list scene bans')
    }

    // Get the banned addresses directly from the database
    const bannedAddresses = await sceneBanManager.listBannedAddresses(place.id)

    logger.info(`Successfully listed ${bannedAddresses.length} banned addresses for place ${place.id}`)

    return bannedAddresses
  }

  return {
    addSceneBan,
    removeSceneBan,
    listSceneBans,
    listSceneBannedAddresses
  }
}
