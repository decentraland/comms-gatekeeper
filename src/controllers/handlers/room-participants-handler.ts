import { IHttpServerComponent } from '@well-known-components/interfaces'
import { ParticipantInfo } from 'livekit-server-sdk'
import { InvalidRequestError } from '../../types/errors'
import { HandlerContextWithPath } from '../../types'

export type RoomParticipantsResponse = {
  ok: boolean
  data: {
    addresses: string[]
  }
}

/**
 * Handler to get the list of participant addresses in a scene or world room.
 *
 * Query parameters:
 * - pointer: Scene pointer/parcel (e.g., "10,20") - used with realm_name for scene rooms
 * - world_name: World name (e.g., "mycoolworld.dcl.eth") - for world rooms
 * - realm_name: Realm name (default: "main") - used with pointer for scene rooms
 *
 * Returns a list of wallet addresses (lowercase, 42 chars) of connected participants.
 */
export async function getRoomParticipantsHandler(
  context: HandlerContextWithPath<'livekit' | 'logs', '/room-participants'>
): Promise<IHttpServerComponent.IResponse> {
  const { livekit, logs } = context.components
  const { url } = context
  const logger = logs.getLogger('room-participants-handler')

  const pointer = url.searchParams.get('pointer')
  const worldName = url.searchParams.get('world_name')
  const realmName = url.searchParams.get('realm_name') || 'main'

  let roomName: string

  if (worldName) {
    // World room
    roomName = livekit.getWorldRoomName(worldName)
  } else if (pointer && realmName) {
    // Scene room - pointer is used as sceneId
    roomName = livekit.getSceneRoomName(realmName, pointer)
  } else {
    throw new InvalidRequestError('Either world_name or (pointer + realm_name) is required')
  }

  logger.debug(`Fetching participants for room: ${roomName}`)

  const roomInfo = await livekit.getRoomInfo(roomName)

  if (!roomInfo) {
    return {
      status: 200,
      body: {
        ok: true,
        data: {
          addresses: []
        }
      }
    }
  }

  const participants = await livekit.listRoomParticipants(roomName)

  // Extract wallet addresses from participant identities (lowercase, first 42 chars)
  const addresses = participants.map((p: ParticipantInfo) => p.identity.toLowerCase().slice(0, 42))

  logger.debug(`Found ${addresses.length} participants in room ${roomName}`)

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        addresses
      }
    }
  }
}
