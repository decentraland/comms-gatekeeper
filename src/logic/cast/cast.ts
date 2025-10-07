import { randomUUID } from 'crypto'
import { AppComponents, SceneStreamAccess } from '../../types'
import { InvalidRequestError, UnauthorizedError } from '../../types/errors'
import { PlaceAttributes } from '../../types/places.type'
import { FOUR_DAYS } from '../time'
import {
  ICastComponent,
  GenerateStreamLinkParams,
  GenerateStreamLinkResult,
  ValidateStreamerTokenResult,
  GenerateWatcherCredentialsResult
} from './types'

// Constants
const STREAM_LINK_EXPIRATION_DAYS = 4

export function createCastComponent(
  components: Pick<
    AppComponents,
    'livekit' | 'logs' | 'sceneStreamAccessManager' | 'sceneManager' | 'places' | 'config'
  >
): ICastComponent {
  const { livekit, logs, sceneStreamAccessManager, sceneManager, places, config } = components
  const logger = logs.getLogger('cast')

  /**
   * Generates a unique stream link for a scene.
   * @param params - Parameters for generating the stream link
   * @returns Stream link details
   */
  async function generateStreamLink(params: GenerateStreamLinkParams): Promise<GenerateStreamLinkResult> {
    const { walletAddress, worldName, parcel, sceneId, realmName } = params

    // Scene ID and realm name are required for chat functionality in Cast2
    if (!sceneId || !realmName) {
      throw new InvalidRequestError('sceneId and realmName are required for Cast2 chat functionality')
    }

    // Get place information
    let place: PlaceAttributes
    if (worldName) {
      place = await places.getPlaceByWorldName(worldName)
    } else if (parcel) {
      place = await places.getPlaceByParcel(parcel)
    } else {
      throw new InvalidRequestError('Either worldName or parcel must be provided')
    }

    // Verify the user is a scene admin
    const isAdmin = await sceneManager.isSceneOwnerOrAdmin(place, walletAddress)

    if (!isAdmin) {
      logger.warn(
        `User ${walletAddress} attempted to generate stream link without admin permissions for place ${place.id}`
      )
      throw new UnauthorizedError('Only scene administrators can generate stream links')
    }

    // Generate a new streaming token
    const streamingKey = `cast2-link-${randomUUID()}`
    const expirationTime = Date.now() + FOUR_DAYS

    // Generate the LiveKit room ID for the scene
    const roomId = livekit.getSceneRoomName(realmName, sceneId)

    // Create stream access entry with expiration
    // Note: For Cast 2.0 with WebRTC, we don't use RTMP ingress
    // Store room_id for efficient lookups by watchers
    await sceneStreamAccessManager.addAccess({
      place_id: place.id,
      streaming_url: '', // Not used for Cast 2.0 WebRTC
      streaming_key: streamingKey,
      ingress_id: '', // Not used for Cast 2.0 WebRTC
      expiration_time: expirationTime,
      room_id: roomId,
      generated_by: walletAddress
    })

    // Get Cast2 URL from config
    const cast2BaseUrl = await config.getString('CAST2_URL')

    // Generate the stream link
    const streamLink = `${cast2BaseUrl}/s/${streamingKey}`

    logger.info(`Stream link generated for place ${place.id} by admin ${walletAddress}`, {
      placeId: place.id,
      streamingKey: streamingKey.substring(0, 20) + '...',
      expiresAt: new Date(expirationTime).toISOString(),
      generatedBy: walletAddress,
      sceneId: sceneId || 'none',
      realmName: realmName || 'none'
    })

    return {
      streamLink,
      streamingKey,
      placeId: place.id,
      placeName: place.title || place.id,
      expiresAt: new Date(expirationTime).toISOString(),
      expiresInDays: STREAM_LINK_EXPIRATION_DAYS
    }
  }

  /**
   * Validates a streaming token and generates LiveKit credentials for a streamer.
   * Streamers connect directly to the scene room where they can publish video/audio streams.
   * @param streamingKey - The streaming key to validate
   * @returns LiveKit credentials and room information
   */
  async function validateStreamerToken(streamingKey: string): Promise<ValidateStreamerTokenResult> {
    // Validate the streaming token using existing scene stream access system
    const streamAccess = await sceneStreamAccessManager.getAccessByStreamingKey(streamingKey)

    if (!streamAccess) {
      logger.warn(`Invalid streaming token provided: ${streamingKey.substring(0, 8)}...`)
      throw new UnauthorizedError('Invalid or expired streaming token')
    }

    // Check if token has expired (for temporary stream links)
    if (streamAccess.expiration_time && Date.now() > streamAccess.expiration_time) {
      logger.warn(`Expired streaming token: ${streamingKey.substring(0, 8)}...`, {
        expiredAt: new Date(streamAccess.expiration_time).toISOString()
      })
      throw new UnauthorizedError('Streaming token has expired')
    }

    // Generate anonymous identity for this streaming session
    const streamerId = `stream:${streamAccess.place_id}:${Date.now()}`

    // Use the room_id from the stream access (scene room format)
    const roomId = streamAccess.room_id!

    // Create LiveKit credentials with publish permissions for the scene room
    const credentials = await livekit.generateCredentials(
      streamerId,
      roomId,
      {
        canPublish: true, // Streamers can publish video/audio
        canSubscribe: true, // Can see other streams
        cast: [streamerId] // Grant casting permissions
      },
      false, // Use production LiveKit
      {
        role: 'streamer',
        placeId: streamAccess.place_id,
        streamingKey
      }
    )

    logger.info(`Streamer token generated for scene room ${roomId}`, {
      streamerId,
      roomId,
      placeId: streamAccess.place_id,
      livekitUrl: credentials.url
    })

    return {
      url: credentials.url,
      token: credentials.token,
      roomId,
      identity: streamerId
    }
  }

  /**
   * Generates LiveKit credentials for a watcher (viewer).
   * Watchers connect to the scene room with read-only permissions (can view streams but not publish).
   * @param roomId - The scene room ID to join (format: scene:${realmName}:${sceneId})
   * @param identity - The identity for the watcher
   * @returns LiveKit credentials
   */
  async function generateWatcherCredentials(
    roomId: string,
    identity: string
  ): Promise<GenerateWatcherCredentialsResult> {
    // Generate anonymous identity if not provided
    const watcherId = identity || `watcher:${roomId}:${Date.now()}-${randomUUID().slice(0, 8)}`

    // Create LiveKit credentials with watch-only permissions for the scene room
    const credentials = await livekit.generateCredentials(
      watcherId,
      roomId,
      {
        canPublish: false, // Watchers cannot publish video/audio
        canSubscribe: true, // Can watch streams and see chat
        cast: [] // No casting permissions
      },
      false, // Use production LiveKit
      {
        role: 'watcher',
        roomId
      }
    )

    logger.info(`Watcher credentials generated for scene room ${roomId}`, {
      watcherId,
      roomId,
      livekitUrl: credentials.url
    })

    return {
      url: credentials.url,
      token: credentials.token,
      roomId,
      identity: watcherId
    }
  }

  return {
    generateStreamLink,
    validateStreamerToken,
    generateWatcherCredentials
  }
}
