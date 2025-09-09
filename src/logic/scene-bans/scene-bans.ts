import { AppComponents, SceneBanAddressWithName } from '../../types'
import { AddSceneBanParams, RemoveSceneBanParams, ListSceneBansParams, ISceneBansComponent } from './types'
import { InvalidRequestError, UnauthorizedError } from '../../types/errors'
import { PlaceAttributes } from '../../types/places.type'
import { AnalyticsEvent } from '../../types/analytics'
import { isErrorWithMessage } from '../../logic/errors'

export function createSceneBansComponent(
  components: Pick<
    AppComponents,
    'sceneBanManager' | 'livekit' | 'logs' | 'sceneManager' | 'places' | 'analytics' | 'names'
  >
): ISceneBansComponent {
  const { sceneBanManager, livekit, logs, sceneManager, places, analytics, names } = components
  const logger = logs.getLogger('scene-bans')

  /**
   * Refresh LiveKit room metadata with the current list of banned addresses for a scene.
   * @param place - The place attributes for the scene.
   * @param roomName - The room name.
   */
  async function refreshRoomBans(place: PlaceAttributes, roomName: string): Promise<void> {
    try {
      // Get the current list of banned addresses for this place
      const bannedAddresses = await sceneBanManager.listBannedAddresses(place.id)

      // Update the room metadata with the banned addresses
      await livekit.updateRoomMetadata(roomName, {
        bannedAddresses: bannedAddresses
      })

      logger.debug(`Updated room metadata for ${roomName} with ${bannedAddresses.length} banned addresses`)
    } catch (error) {
      logger.warn(
        `Failed to update room metadata for place ${place.id}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }`
      )
      // Don't throw the error to avoid breaking the main ban/unban operations
    }
  }

  /**
   * Adds a ban for a user from a scene with permission validation.
   * @param bannedAddress - The address of the user being banned.
   * @param bannedBy - The address of the user performing the ban.
   * @param params - The parameters for the ban.
   */
  async function addSceneBan(bannedAddress: string, bannedBy: string, params: AddSceneBanParams): Promise<void> {
    const { sceneId, realmName, parcel, isWorld } = params

    logger.debug(`Banning user ${bannedAddress} by user ${bannedBy}`, {
      sceneId: sceneId || '',
      realmName,
      parcel: parcel || '',
      isWorld: String(isWorld)
    })

    let place: PlaceAttributes

    if (isWorld) {
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

    const roomName = livekit.getRoomName(realmName, { isWorld, sceneId })

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

    await refreshRoomBans(place, roomName)

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
    const { sceneId, realmName, parcel, isWorld } = params

    logger.debug(`Unbanning user ${bannedAddress} by user ${unbannedBy}`, {
      sceneId: sceneId || '',
      realmName,
      parcel: parcel || '',
      isWorld: String(isWorld)
    })

    let place: PlaceAttributes

    if (isWorld) {
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

    const roomName = livekit.getRoomName(realmName, { isWorld, sceneId })

    await refreshRoomBans(place, roomName)

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
   * @returns The list of banned addresses with their names and total count.
   * @throws UnauthorizedError if the user does not have permission to list scene bans.
   */
  async function listSceneBans(
    requestedBy: string,
    params: ListSceneBansParams
  ): Promise<{ bans: SceneBanAddressWithName[]; total: number }> {
    const { addresses, total } = await listSceneBannedAddresses(requestedBy, params)

    const bannedNames = await names.getNamesFromAddresses(addresses)

    logger.info(`Successfully listed ${bannedNames.length} bans for place`)

    const bans = addresses.map((address) => ({
      bannedAddress: address,
      name: bannedNames[address]
    }))

    return { bans, total }
  }

  /**
   * Lists only the banned addresses for a scene with permission validation.
   * @param requestedBy - The address of the user requesting the list.
   * @param params - The parameters for the list.
   * @returns The list of banned addresses and total count.
   * @throws UnauthorizedError if the user does not have permission to list scene banned addresses.
   */
  async function listSceneBannedAddresses(
    requestedBy: string,
    params: ListSceneBansParams
  ): Promise<{ addresses: string[]; total: number }> {
    const { sceneId, realmName, parcel, isWorld, page, limit } = params
    const lowercasedRequestedBy = requestedBy.toLowerCase()

    logger.debug(`Listing banned addresses for scene by user ${lowercasedRequestedBy}`, {
      sceneId: sceneId || '',
      realmName,
      parcel: parcel || '',
      isWorld: String(isWorld),
      page: page || 1,
      limit: limit || 20
    })

    let place: PlaceAttributes

    if (isWorld) {
      place = await places.getPlaceByWorldName(realmName)
    } else {
      place = await places.getPlaceByParcel(parcel)
    }

    // Check if the user requesting the list has permission
    const isOwnerOrAdmin = await sceneManager.isSceneOwnerOrAdmin(place, lowercasedRequestedBy)
    if (!isOwnerOrAdmin) {
      throw new UnauthorizedError('User does not have permission to list scene bans')
    }

    // Calculate offset for pagination
    const offset = page && limit ? (page - 1) * limit : undefined

    // Get both the addresses and total count
    const [addresses, total] = await Promise.all([
      sceneBanManager.listBannedAddresses(place.id, limit, offset),
      sceneBanManager.countBannedAddresses(place.id)
    ])

    logger.info(`Successfully listed ${addresses.length} banned addresses for place ${place.id} (total: ${total})`)

    return { addresses, total }
  }

  return {
    addSceneBan,
    removeSceneBan,
    listSceneBans,
    listSceneBannedAddresses
  }
}
