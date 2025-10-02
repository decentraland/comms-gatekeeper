import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, NotFoundError } from '../../../types/errors'

export async function roomInfoHandler(
  context: HandlerContextWithPath<'livekit' | 'logs' | 'config', '/cast/room-info/:roomId'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { livekit, logs },
    params
  } = context

  const logger = logs.getLogger('room-info-handler')
  const roomId = params.roomId

  if (!roomId) {
    throw new InvalidRequestError('Room ID is required')
  }

  try {
    // Get room information from LiveKit
    const room = await livekit.getRoomInfo(roomId)

    if (!room) {
      throw new NotFoundError(`Room ${roomId} not found`)
    }

    // Basic room info without detailed participant analysis
    // (LiveKit Room object doesn't include participant details by default)
    const roomInfo = {
      roomId: room.name,
      participantCount: room.numParticipants,
      streamerCount: 0, // Would need separate participant query
      watcherCount: room.numParticipants,
      activeStreams: 0, // Would need separate track query
      createdAt: Number(room.creationTime),
      isActive: room.numParticipants > 0,
      metadata: room.metadata ? JSON.parse(room.metadata) : {}
    }

    logger.debug(`Room info retrieved for ${roomId}`, {
      roomId: roomInfo.roomId,
      participantCount: roomInfo.participantCount,
      isActiveFlag: roomInfo.isActive ? 1 : 0
    })

    return {
      status: 200,
      body: roomInfo
    }
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof InvalidRequestError) {
      throw error
    }

    logger.error(`Failed to get room info for ${roomId}: ${(error as Error).message}`)
    throw new InvalidRequestError('Failed to retrieve room information')
  }
}
