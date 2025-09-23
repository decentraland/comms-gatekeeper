import { AppComponents, SceneBanAddressWithName } from '../../types'
import {
  AddSceneBanParams,
  RemoveSceneBanParams,
  ListSceneBansParams,
  ISceneBansComponent,
  IsUserBannedParams
} from './types'
import { InvalidRequestError, UnauthorizedError } from '../../types/errors'
import { PlaceAttributes } from '../../types/places.type'
import { AnalyticsEvent } from '../../types/analytics'
import { isErrorWithMessage } from '../../logic/errors'
import { EthAddress, Events, UserBannedFromSceneEvent, UserUnbannedFromSceneEvent } from '@dcl/schemas'

export function createSceneBansComponent(
  components: Pick<
    AppComponents,
    | 'sceneBanManager'
    | 'livekit'
    | 'logs'
    | 'sceneManager'
    | 'places'
    | 'analytics'
    | 'names'
    | 'contentClient'
    | 'publisher'
  >
): ISceneBansComponent {
  const { sceneBanManager, livekit, logs, sceneManager, places, analytics, names, contentClient, publisher } =
    components
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
   * Publishes a scene ban event without waiting for it to be published.
   * @param affectedUserAddress - The address of the user being banned.
   * @param place - The place attributes.
   * @param isBanned - Whether the user is banned.
   */
  async function publishSceneBanEvent(
    affectedUserAddress: EthAddress,
    place: PlaceAttributes,
    isBanned: boolean = true
  ): Promise<void> {
    const subType = isBanned
      ? Events.SubType.Comms.USER_BANNED_FROM_SCENE
      : Events.SubType.Comms.USER_UNBANNED_FROM_SCENE

    const event: UserBannedFromSceneEvent | UserUnbannedFromSceneEvent = {
      type: Events.Type.COMMS,
      subType,
      key: `${place.id}-${affectedUserAddress}`,
      timestamp: Date.now(),
      metadata: {
        userAddress: affectedUserAddress,
        placeTitle: place.title || `Place at ${place.base_position}`
      }
    }

    setImmediate(async () => {
      const action = isBanned ? 'ban' : 'unban'

      try {
        await publisher.publishMessages([event])
        logger.debug(`Published scene ${action} event for ${affectedUserAddress}`)
      } catch (error) {
        const errorMessage = isErrorWithMessage(error) ? error.message : 'Unknown error'
        logger.warn(`Failed to publish scene ${action} event: ${errorMessage}`)
      }
    })
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
        placeId: place.id,
        bannedAddress: bannedAddress.toLowerCase(),
        bannedBy: bannedBy.toLowerCase()
      })
    ])

    void publishSceneBanEvent(bannedAddress, place)

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

    void publishSceneBanEvent(bannedAddress, place, false)

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
      sceneBanManager.listBannedAddresses(place.id, { limit, offset }),
      sceneBanManager.countBannedAddresses(place.id)
    ])

    logger.info(`Successfully listed ${addresses.length} banned addresses for place ${place.id} (total: ${total})`)

    return { addresses, total }
  }

  /**
   * Checks if a user is banned from a scene.
   * @param address - The address of the user to check.
   * @param params - The parameters for the check.
   * @returns True if the user is banned, false otherwise.
   */
  async function isUserBanned(address: string, params: IsUserBannedParams): Promise<boolean> {
    const { sceneId, realmName, parcel, isWorld } = params

    logger.debug(`Checking if user ${address} is banned from scene`, {
      sceneId: sceneId || '',
      realmName,
      parcel: parcel || '',
      isWorld: String(isWorld)
    })

    let place: PlaceAttributes

    if (isWorld) {
      place = await places.getPlaceByWorldName(realmName)
    } else if (parcel) {
      place = await places.getPlaceByParcel(parcel)
    } else if (sceneId) {
      const entity = await contentClient.fetchEntityById(sceneId)
      place = await places.getPlaceByParcel(entity.metadata.scene.base)
    } else {
      throw new InvalidRequestError('No scene ID, world name or parcel provided')
    }

    const isBanned = await sceneBanManager.isBanned(place.id, address.toLowerCase())

    logger.debug(`User ${address} is ${isBanned ? 'banned' : 'not banned'} from place ${place.id}`)

    return isBanned
  }

  /**
   * Removes all bans for disabled places.
   * This function is designed to be called by a cron job to clean up bans for places that have been disabled.
   */
  async function removeBansFromDisabledPlaces(): Promise<void> {
    logger.info('Starting removal of bans from disabled places')

    try {
      // Get all places with bans
      const placesIdWithBans = await sceneBanManager.getPlacesIdWithBans()

      if (placesIdWithBans.length === 0) {
        logger.info('No places with bans found')
        return
      }

      // Get place status for all places with bans
      let placesFromIds: Array<Pick<PlaceAttributes, 'id' | 'disabled' | 'world' | 'world_name' | 'base_position'>> = []
      const batchSize = 100

      for (let i = 0; i < placesIdWithBans.length; i += batchSize) {
        const batch = placesIdWithBans.slice(i, i + batchSize)
        const batchResult = await places.getPlaceStatusByIds(batch)
        placesFromIds = placesFromIds.concat(batchResult)
      }

      // Filter disabled places
      const placesDisabled = placesFromIds.filter((place) => place.disabled)

      if (placesDisabled.length === 0) {
        logger.info('No disabled places with bans found')
        return
      }

      logger.info(
        `Found ${placesDisabled.length} disabled places with bans: ${placesDisabled.map((place) => place.id).join(', ')}`
      )

      // Remove bans for all disabled places
      const disabledPlaceIds = placesDisabled.map((place) => place.id)
      await sceneBanManager.removeBansByPlaceIds(disabledPlaceIds)

      logger.info(
        `Successfully removed bans for ${disabledPlaceIds.length} disabled places: ${disabledPlaceIds.join(', ')}`
      )
    } catch (error) {
      logger.error(
        `Error while removing bans from disabled places: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw error
    }
  }

  return {
    addSceneBan,
    removeSceneBan,
    listSceneBans,
    listSceneBannedAddresses,
    isUserBanned,
    removeBansFromDisabledPlaces
  }
}
