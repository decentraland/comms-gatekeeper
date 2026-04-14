import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function getStreamInfoHandler(
  ctx: Pick<
    HandlerContextWithPath<
      'sceneStreamAccessManager' | 'places' | 'logs' | 'livekit',
      '/cast/stream-info/:streamingKey'
    >,
    'components' | 'params'
  >
) {
  const {
    components: { logs, sceneStreamAccessManager, places, livekit },
    params
  } = ctx
  const logger = logs.getLogger('get-stream-info-handler')

  const streamingKey = params.streamingKey

  if (!streamingKey) {
    logger.debug('Missing streaming key')
    throw new InvalidRequestError('Streaming key is required')
  }

  logger.debug(`Getting stream info for streaming key: ${streamingKey.substring(0, 20)}...`)

  // Get stream access by streaming key
  const streamAccess = await sceneStreamAccessManager.getAccessByStreamingKey(streamingKey)

  if (!streamAccess) {
    logger.debug(`Stream access not found for key: ${streamingKey.substring(0, 20)}...`)
    throw new InvalidRequestError('Invalid streaming key')
  }

  // Check if stream access is active and not expired
  if (!streamAccess.active) {
    logger.debug(`Stream access is not active for key: ${streamingKey.substring(0, 20)}...`)
    throw new InvalidRequestError('Stream access is not active')
  }

  if (streamAccess.expiration_time && Number(streamAccess.expiration_time) < Date.now()) {
    logger.debug(`Stream access has expired for key: ${streamingKey.substring(0, 20)}...`)
    throw new InvalidRequestError('Stream access has expired')
  }

  // Handle synthetic preview places (created by local preview flow)
  let placeName: string
  let isWorld: boolean
  let location: string

  const { realmName } = livekit.getRoomMetadataFromRoomName(streamAccess.place_id)
  if (livekit.isLocalPreview(realmName)) {
    placeName = 'Local Preview'
    isWorld = false
    location = 'preview'
  } else {
    // Fetch place information from Places API
    const place = await places.getPlaceStatusByIds([streamAccess.place_id])

    if (!place || place.length === 0) {
      logger.debug(`Place not found for place_id: ${streamAccess.place_id}`)
      throw new InvalidRequestError('Place not found')
    }

    const placeData = place[0]
    placeName = placeData.world_name || `${placeData.base_position}`
    isWorld = placeData.world
    location = isWorld ? placeData.world_name! : placeData.base_position
  }

  logger.info(`Stream info retrieved for place ${streamAccess.place_id}`, {
    placeId: streamAccess.place_id,
    placeName,
    location,
    isWorld: isWorld ? 'true' : 'false',
    streamingKey: streamingKey.substring(0, 20) + '...'
  })

  return {
    status: 200,
    body: {
      placeName,
      placeId: streamAccess.place_id,
      location,
      isWorld
    }
  }
}
