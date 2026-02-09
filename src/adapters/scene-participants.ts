import { IBaseComponent } from '@well-known-components/interfaces'
import { EthAddress } from '@dcl/schemas'
import { AppComponents } from '../types'
import { InvalidRequestError, NotFoundError } from '../types/errors'

export type SceneParticipantsParams = {
  pointer?: string | null
  realmName?: string | null
}

export interface ISceneParticipantsComponent extends IBaseComponent {
  getParticipantAddresses(params: SceneParticipantsParams): Promise<string[]>
}

function isWorldName(name: string): boolean {
  return name.endsWith('.eth')
}

export async function createSceneParticipantsComponent(
  components: Pick<AppComponents, 'livekit' | 'contentClient' | 'worlds' | 'logs'>
): Promise<ISceneParticipantsComponent> {
  const { livekit, contentClient, worlds, logs } = components
  const logger = logs.getLogger('scene-participants')

  async function getParticipantAddresses(params: SceneParticipantsParams): Promise<string[]> {
    const { pointer, realmName } = params

    let roomName: string

    if (realmName && isWorldName(realmName) && pointer) {
      // World scene room: fetch the scene ID from the world content server
      const worldScene = await worlds.fetchWorldSceneByPointer(realmName, pointer)

      if (!worldScene) {
        throw new NotFoundError(`No scene found for world ${realmName} at pointer: ${pointer}`)
      }

      const sceneId = worldScene.entityId
      logger.debug(`Resolved world ${realmName} pointer ${pointer} to sceneId ${sceneId}`)

      roomName = livekit.getWorldSceneRoomName(realmName, sceneId)
    } else if (realmName && isWorldName(realmName)) {
      // World room (no pointer): get all participants in the world
      logger.debug(`Getting participants for world room: ${realmName}`)
      roomName = livekit.getWorldRoomName(realmName)
    } else if (pointer && realmName) {
      // Regular scene room: fetch the scene ID from the catalyst
      const entities = await contentClient.fetchEntitiesByPointers([pointer])

      if (!entities || entities.length === 0) {
        throw new NotFoundError(`No scene found for pointer: ${pointer}`)
      }

      const sceneId = entities[0].id
      logger.debug(`Resolved pointer ${pointer} to sceneId ${sceneId}`)

      roomName = livekit.getSceneRoomName(realmName, sceneId)
    } else {
      throw new InvalidRequestError('Either pointer with realm_name or a world realm_name must be provided')
    }

    logger.debug(`Fetching participants for room: ${roomName}`)

    const roomInfo = await livekit.getRoomInfo(roomName)

    if (!roomInfo) {
      return []
    }

    const participants = await livekit.listRoomParticipants(roomName)

    // Extract wallet addresses from participant identities (lowercase, first 42 chars)
    // Filter only valid Ethereum addresses
    const addresses = participants
      .map((p) => p.identity.toLowerCase().slice(0, 42))
      .filter((address) => EthAddress.validate(address))

    logger.debug(`Found ${addresses.length} valid participants in room ${roomName}`)

    return addresses
  }

  return {
    getParticipantAddresses
  }
}
