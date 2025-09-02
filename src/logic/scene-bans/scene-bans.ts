import { AppComponents } from '../../types'
import { AddSceneBanParams, ISceneBansComponent } from './types'
import { isErrorWithMessage } from '../errors'
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

    // Add the ban to the database
    await sceneBanManager.addBan({
      place_id: place.id,
      banned_address: bannedAddress.toLowerCase(),
      banned_by: bannedBy.toLowerCase()
    })

    // Remove the banned user from the LiveKit voice chat room
    try {
      let roomName: string
      if (isWorlds) {
        roomName = livekit.getWorldRoomName(realmName)
      } else {
        if (!sceneId) {
          logger.warn(`No sceneId available for LiveKit room removal for place ${place.id}`)
          return
        } else {
          roomName = livekit.getSceneRoomName(realmName, sceneId)
        }
      }

      await livekit.removeParticipant(roomName, bannedAddress.toLowerCase())
      logger.info(`Successfully removed banned user ${bannedAddress} from LiveKit room ${roomName}`)
    } catch (error) {
      // Log the error but don't fail the ban operation
      logger.warn(
        `Failed to remove banned user ${bannedAddress} from LiveKit room: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
    }
  }

  return {
    addSceneBan
  }
}
