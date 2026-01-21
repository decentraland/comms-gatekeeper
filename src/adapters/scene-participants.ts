import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents } from '../types'
import { InvalidRequestError, NotFoundError } from '../types/errors'

export type SceneParticipantsParams = {
  pointer?: string | null
  worldName?: string | null
  realmName?: string | null
}

export interface ISceneParticipantsComponent extends IBaseComponent {
  getParticipantAddresses(params: SceneParticipantsParams): Promise<string[]>
}

export async function createSceneParticipantsComponent(
  components: Pick<AppComponents, 'livekit' | 'contentClient' | 'logs'>
): Promise<ISceneParticipantsComponent> {
  const { livekit, contentClient, logs } = components
  const logger = logs.getLogger('scene-participants')

  async function getParticipantAddresses(params: SceneParticipantsParams): Promise<string[]> {
    const { pointer, worldName, realmName } = params

    let roomName: string

    if (worldName) {
      // Explicit world_name parameter takes priority
      roomName = livekit.getWorldRoomName(worldName)
    } else if (pointer && realmName) {
      // Scene room: pointer + realm_name
      const entities = await contentClient.fetchEntitiesByPointers([pointer])

      if (!entities || entities.length === 0) {
        throw new NotFoundError(`No scene found for pointer: ${pointer}`)
      }

      const sceneId = entities[0].id
      logger.debug(`Resolved pointer ${pointer} to sceneId ${sceneId}`)

      roomName = livekit.getSceneRoomName(realmName, sceneId)
    } else if (realmName && !pointer) {
      // Only realm_name provided (no pointer): treat realm_name as a world name
      logger.debug(`Treating realm_name "${realmName}" as world name`)
      roomName = livekit.getWorldRoomName(realmName)
    } else {
      throw new InvalidRequestError('Either world_name, realm_name (as world), or (pointer + realm_name) is required')
    }

    logger.debug(`Fetching participants for room: ${roomName}`)

    const roomInfo = await livekit.getRoomInfo(roomName)

    if (!roomInfo) {
      return []
    }

    const participants = await livekit.listRoomParticipants(roomName)

    // Extract wallet addresses from participant identities (lowercase, first 42 chars)
    const addresses = participants.map((p) => p.identity.toLowerCase().slice(0, 42))

    logger.debug(`Found ${addresses.length} participants in room ${roomName}`)

    return addresses
  }

  return {
    getParticipantAddresses
  }
}
