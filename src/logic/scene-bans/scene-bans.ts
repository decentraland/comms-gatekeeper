import { AppComponents } from '../../types'
import { AddSceneBanParams, ISceneBansComponent } from './types'
import { InvalidRequestError, UnauthorizedError } from '../../types/errors'

export function createSceneBansComponent(
  components: Pick<AppComponents, 'sceneBanManager' | 'livekit' | 'logs' | 'sceneManager' | 'places'>
): ISceneBansComponent {
  const { sceneBanManager, livekit, logs, sceneManager, places } = components
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

    const place = await places.getPlaceByParcelOrWorldName(isWorlds ? realmName : parcel!, { isWorlds })

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
    await livekit.removeParticipant(roomName, bannedAddress.toLowerCase())

    logger.info(`Successfully removed participant ${bannedAddress} from LiveKit room ${roomName}`)

    // Add the ban to the database
    await sceneBanManager.addBan({
      place_id: place.id,
      banned_address: bannedAddress.toLowerCase(),
      banned_by: bannedBy.toLowerCase()
    })

    logger.info(`Successfully banned user ${bannedAddress} for place ${place.id}`)
  }

  return {
    addSceneBan
  }
}
