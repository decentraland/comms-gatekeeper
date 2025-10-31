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

/**
 * Helper function to build stream and watcher links from streaming key and location.
 * @internal
 */
export function buildStreamLinks(
  cast2BaseUrl: string | undefined,
  streamingKey: string,
  location: string
): { streamLink: string; watcherLink: string } {
  const baseUrl = cast2BaseUrl || 'https://cast2.decentraland.org'
  return {
    streamLink: `${baseUrl}/s/${streamingKey}`,
    watcherLink: `${baseUrl}/w/${location}`
  }
}

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

    // Generate the LiveKit room ID for the scene
    const roomId = worldName ? livekit.getWorldRoomName(worldName) : livekit.getSceneRoomName(realmName, sceneId)

    // Try to reuse existing active stream key
    const existingAccess = await sceneStreamAccessManager.getLatestAccessByPlaceId(place.id)

    // Reuse if:
    // - Exists an active key
    // - Has not expired
    // - Has the same room_id (same location)
    const canReuse =
      existingAccess &&
      existingAccess.room_id === roomId &&
      (!existingAccess.expiration_time || Number(existingAccess.expiration_time) > Date.now())

    let streamingKey: string
    let expirationTime: number

    if (canReuse && existingAccess) {
      streamingKey = existingAccess.streaming_key
      expirationTime = existingAccess.expiration_time ? Number(existingAccess.expiration_time) : Date.now() + FOUR_DAYS

      logger.info(`Reusing existing stream key for place ${place.id}`, {
        placeId: place.id,
        streamingKey: streamingKey.substring(0, 20) + '...',
        ingressId: existingAccess.ingress_id ? existingAccess.ingress_id.substring(0, 10) + '...' : 'none',
        roomId: existingAccess.room_id || 'none'
      })
    } else {
      // Create new stream key with ingress for OBS compatibility
      const participantIdentity = randomUUID()
      const ingress = await livekit.getOrCreateIngress(roomId, `${participantIdentity}-streamer`)

      // Use ingress streamKey for full OBS compatibility
      streamingKey = ingress.streamKey
      expirationTime = Date.now() + FOUR_DAYS

      // Create stream access entry with BOTH ingress_id and room_id for full compatibility
      await sceneStreamAccessManager.addAccess({
        place_id: place.id,
        streaming_url: ingress.url || '',
        streaming_key: streamingKey,
        ingress_id: ingress.ingressId || '',
        expiration_time: expirationTime,
        room_id: roomId,
        generated_by: walletAddress
      })

      logger.info(`Stream link generated for place ${place.id} by admin ${walletAddress}`, {
        placeId: place.id,
        streamingKey: streamingKey.substring(0, 20) + '...',
        expiresAt: new Date(expirationTime).toISOString(),
        generatedBy: walletAddress,
        sceneId: sceneId || 'none',
        realmName: realmName || 'none'
      })
    }

    // Build links and calculate expiration (common for both reuse and new)
    const cast2BaseUrl = await config.getString('CAST2_URL')
    const location = worldName || parcel || 'none'
    const { streamLink, watcherLink } = buildStreamLinks(cast2BaseUrl, streamingKey, location)
    const daysLeft = Math.ceil((expirationTime - Date.now()) / (24 * 60 * 60 * 1000))

    return {
      streamLink,
      watcherLink,
      streamingKey,
      placeId: place.id,
      placeName: place.title || place.id,
      expiresAt: new Date(expirationTime).toISOString(),
      expiresInDays: daysLeft
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
    if (streamAccess.expiration_time && Date.now() > Number(streamAccess.expiration_time)) {
      logger.warn(`Expired streaming token: ${streamingKey.substring(0, 8)}...`, {
        expiredAt: new Date(Number(streamAccess.expiration_time)).toISOString()
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
    if (streamAccess.expiration_time && Date.now() > Number(streamAccess.expiration_time)) {
      logger.warn(`Expired stream access for location ${location}`, {
        placeId: place.id,
        isWorldName: isWorldName ? 'true' : 'false',
        expiredAt: new Date(Number(streamAccess.expiration_time)).toISOString()
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
