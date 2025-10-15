import { randomUUID } from 'crypto'
import { AppComponents } from '../../types'
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
   * @param identity - Display name for the streamer (required, provided by frontend)
   * @returns LiveKit credentials and room information
   */
  async function validateStreamerToken(streamingKey: string, identity: string): Promise<ValidateStreamerTokenResult> {
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

    // Use the room_id from the stream access (scene room format)
    const roomId = streamAccess.room_id!

    // Generate unique internal ID for LiveKit identity (prevents collisions)
    // Format: stream:{placeId}:{timestamp}
    const internalId = `stream:${streamAccess.place_id}:${Date.now()}`

    // Create LiveKit credentials with publish permissions for the scene room
    // Use internalId as LiveKit identity (guaranteed unique)
    // Store user's display name in metadata for UI display
    const credentials = await livekit.generateCredentials(
      internalId,
      roomId,
      {
        canPublish: true, // Streamers can publish video/audio
        canSubscribe: true, // Can see other streams
        cast: [internalId] // Grant full casting permissions using the unique internal ID
      },
      false, // Use production LiveKit
      {
        role: 'streamer',
        displayName: identity
      }
    )

    logger.info(`Streamer token generated for scene room ${roomId}`, {
      internalId,
      displayName: identity,
      roomId,
      placeId: streamAccess.place_id,
      livekitUrl: credentials.url
    })

    return {
      url: credentials.url,
      token: credentials.token,
      roomId,
      identity: internalId // Return the unique internal ID
    }
  }

  /**
   * Generates LiveKit credentials for a watcher (viewer).
   * Watchers connect to the scene room with read-only permissions (can view streams but not publish).
   * @param roomId - The scene room ID to join (format: scene:${realmName}:${sceneId})
   * @param identity - Display name for the watcher (required, provided by frontend)
   * @returns LiveKit credentials
   */
  async function generateWatcherCredentials(
    roomId: string,
    identity: string
  ): Promise<GenerateWatcherCredentialsResult> {
    // Generate unique internal ID for LiveKit identity (prevents collisions)
    // Format: watch:{roomId}:{timestamp}
    const internalId = `watch:${roomId}:${Date.now()}`

    // Create LiveKit credentials with watch-only permissions for the scene room
    // Use internalId as LiveKit identity (guaranteed unique)
    // Store user's display name in metadata for UI display
    const credentials = await livekit.generateCredentials(
      internalId,
      roomId,
      {
        canPublish: false, // Watchers cannot publish video/audio
        canSubscribe: true, // Can watch streams and see chat
        cast: [] // No casting permissions
      },
      false, // Use production LiveKit
      {
        role: 'watcher',
        displayName: identity,
        roomId
      }
    )

    logger.info(`Watcher credentials generated for scene room ${roomId}`, {
      internalId,
      displayName: identity,
      roomId,
      livekitUrl: credentials.url
    })

    return {
      url: credentials.url,
      token: credentials.token,
      roomId,
      identity: internalId // Return the unique internal ID
    }
  }

  /**
   * Generates LiveKit credentials for a watcher (viewer) using location (parcel or world name).
   * Looks up the most recent active stream for the given location and validates it hasn't expired.
   * @param location - Either parcel coordinates (e.g., "20,-4") or world name (e.g., "goerliplaza.dcl.eth")
   * @param identity - Display name for the watcher (required, provided by frontend)
   * @returns LiveKit credentials with place name
   */
  async function generateWatcherCredentialsByLocation(
    location: string,
    identity: string
  ): Promise<GenerateWatcherCredentialsResult> {
    // Detect if location is a world name (contains .dcl.eth) or parcel coordinates
    const isWorldName = location.includes('.dcl.eth')

    // Get place information from location
    const place = isWorldName ? await places.getPlaceByWorldName(location) : await places.getPlaceByParcel(location)

    // Get the most recent stream access for this place
    const streamAccess = await sceneStreamAccessManager.getLatestAccessByPlaceId(place.id)

    if (!streamAccess) {
      logger.warn(`No active stream found for location ${location}`, {
        placeId: place.id,
        isWorldName: isWorldName ? 'true' : 'false'
      })
      throw new UnauthorizedError('No active stream found for this location')
    }

    // Check if the stream access has expired (4 days limit for Cast2)
    if (streamAccess.expiration_time && Date.now() > streamAccess.expiration_time) {
      logger.warn(`Expired stream access for location ${location}`, {
        placeId: place.id,
        isWorldName: isWorldName ? 'true' : 'false',
        expiredAt: new Date(streamAccess.expiration_time).toISOString()
      })
      throw new UnauthorizedError('Stream access has expired. Please generate a new stream link.')
    }

    // Use the room_id from the stream access
    const roomId = streamAccess.room_id!

    // Generate watcher credentials using the existing method
    const credentials = await generateWatcherCredentials(roomId, identity)

    // Add place name to credentials for UI display
    const placeName = place.title || (place.world_name ? place.world_name : location)

    logger.info(`Watcher credentials generated for location ${location}`, {
      location,
      isWorldName: isWorldName ? 'true' : 'false',
      placeId: place.id,
      placeName,
      roomId,
      identity: credentials.identity
    })

    return {
      ...credentials,
      placeName
    }
  }

  return {
    generateStreamLink,
    validateStreamerToken,
    generateWatcherCredentials,
    generateWatcherCredentialsByLocation
  }
}
