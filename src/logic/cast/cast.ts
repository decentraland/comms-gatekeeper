import { randomUUID } from 'crypto'
import { AppComponents } from '../../types'
import { PlaceAttributes } from '../../types/places.type'
import {
  InvalidStreamingKeyError,
  ExpiredStreamingKeyError,
  NoActiveStreamError,
  NotSceneAdminError,
  ExpiredStreamAccessError
} from './errors'
import { FOUR_DAYS } from '../time'
import {
  ICastComponent,
  GenerateStreamLinkParams,
  GenerateStreamLinkResult,
  ValidateStreamerTokenResult,
  GenerateWatcherCredentialsResult,
  PresentationBotTokenResult,
  GetPresentersResult
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

/**
 * Creates the Cast component for managing streaming and presenter roles.
 *
 * Orchestrates:
 * 1. Stream link generation with admin validation and ingress creation
 * 2. Streamer/watcher/bot token generation with LiveKit credentials
 * 3. Presenter role management (promote/demote) with scene admin checks
 *
 * @param components - Required dependencies
 * @returns ICastComponent implementation
 */
export function createCastComponent(
  components: Pick<
    AppComponents,
    'livekit' | 'logs' | 'sceneStreamAccessManager' | 'sceneManager' | 'places' | 'config'
  >
): ICastComponent {
  const { livekit, logs, sceneStreamAccessManager, sceneManager, places, config } = components
  const logger = logs.getLogger('cast')

  /**
   * Creates or reuses stream access for a place, returning the streaming key and expiration.
   * Shared logic used by both generateStreamLink and generatePreviewStreamLink.
   */
  async function createStreamAccess(
    place: PlaceAttributes,
    roomId: string,
    walletAddress: string
  ): Promise<GenerateStreamLinkResult> {
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

      logger.info(`Stream link generated for place ${place.id} by ${walletAddress}`, {
        placeId: place.id,
        streamingKey: streamingKey.substring(0, 20) + '...',
        expiresAt: new Date(expirationTime).toISOString(),
        generatedBy: walletAddress
      })
    }

    // Build links and calculate expiration
    const cast2BaseUrl = await config.getString('CAST2_URL')
    const location = place.world_name || place.base_position || 'none'
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
   * Generates a unique stream link for a scene. Requires admin permissions.
   *
   * @param params - Parameters for generating the stream link
   * @returns Stream link details including streaming key and expiration
   * @throws {NotSceneAdminError} If the caller is not a scene admin
   */
  async function generateStreamLink(params: GenerateStreamLinkParams): Promise<GenerateStreamLinkResult> {
    const { walletAddress, worldName, parcel, sceneId, realmName } = params

    const roomId = worldName
      ? livekit.getWorldSceneRoomName(worldName, sceneId)
      : livekit.getSceneRoomName(realmName, sceneId)

    const place = worldName ? await places.getWorldScenePlace(worldName, parcel) : await places.getPlaceByParcel(parcel)

    const isAdmin = await sceneManager.isSceneOwnerOrAdmin(place, walletAddress)
    if (!isAdmin) {
      logger.warn(
        `User ${walletAddress} attempted to generate stream link without admin permissions for place ${place.id}`
      )
      throw new NotSceneAdminError('Only scene administrators can generate stream links')
    }

    return createStreamAccess(place, roomId, walletAddress)
  }

  /**
   * Generates a stream link for local preview. Skips admin check and uses a synthetic place.
   * @param params - Parameters for generating the preview stream link
   * @returns Stream link details
   */
  async function generatePreviewStreamLink(params: {
    sceneId: string
    realmName: string
    walletAddress: string
  }): Promise<GenerateStreamLinkResult> {
    const { sceneId, realmName, walletAddress } = params

    const roomId = livekit.getSceneRoomName(realmName, sceneId)
    const place = {
      id: roomId,
      title: 'Local Preview'
    } as PlaceAttributes

    logger.info(`Using synthetic place for local preview`, { placeId: roomId, roomId })

    return createStreamAccess(place, roomId, walletAddress)
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
      throw new InvalidStreamingKeyError()
    }

    // Check if token has expired (for temporary stream links)
    if (streamAccess.expiration_time && Date.now() > Number(streamAccess.expiration_time)) {
      logger.warn(`Expired streaming token: ${streamingKey.substring(0, 8)}...`, {
        expiredAt: new Date(Number(streamAccess.expiration_time)).toISOString()
      })
      throw new ExpiredStreamingKeyError()
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

    // Auto-add streamer as presenter in room metadata
    await addPresenter(roomId, internalId)

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
   * @param parcel - Optional parcel to resolve a specific scene within a world
   * @returns LiveKit credentials with place name
   */
  async function generateWatcherCredentialsByLocation(
    location: string,
    identity: string,
    parcel?: string
  ): Promise<GenerateWatcherCredentialsResult> {
    const isWorldName = location.endsWith('.eth')

    let place: PlaceAttributes
    if (isWorldName && parcel) {
      place = await places.getWorldScenePlace(location, parcel)
    } else if (isWorldName) {
      // Backwards compatibility: fall back to world-level lookup when no parcel is provided
      place = await places.getWorldByName(location)
    } else {
      place = await places.getPlaceByParcel(location)
    }

    // Get the most recent stream access for this place
    const streamAccess = await sceneStreamAccessManager.getLatestAccessByPlaceId(place.id)

    if (!streamAccess) {
      logger.warn(`No active stream found for location ${location}`, {
        placeId: place.id,
        isWorldName: isWorldName ? 'true' : 'false'
      })
      throw new NoActiveStreamError(location)
    }

    // Check if the stream access has expired (4 days limit for Cast2)
    if (streamAccess.expiration_time && Date.now() > Number(streamAccess.expiration_time)) {
      logger.warn(`Expired stream access for location ${location}`, {
        placeId: place.id,
        isWorldName: isWorldName ? 'true' : 'false',
        expiredAt: new Date(Number(streamAccess.expiration_time)).toISOString()
      })
      throw new ExpiredStreamAccessError()
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

  /**
   * Generates a LiveKit token for the presentation bot participant.
   * The bot joins the room with publish-only permissions to stream presentation slides.
   *
   * @param streamingKey - The streaming key used by the streamer
   * @returns LiveKit connection details for the presentation bot
   * @throws {InvalidStreamingKeyError} If the streaming key is not found
   * @throws {ExpiredStreamingKeyError} If the streaming key has expired
   */
  async function generatePresentationBotToken(streamingKey: string): Promise<PresentationBotTokenResult> {
    const streamAccess = await sceneStreamAccessManager.getAccessByStreamingKey(streamingKey)

    if (!streamAccess) {
      logger.warn(`Invalid streaming key for presentation bot: ${streamingKey.substring(0, 8)}...`)
      throw new InvalidStreamingKeyError()
    }

    if (streamAccess.expiration_time && Date.now() > Number(streamAccess.expiration_time)) {
      logger.warn(`Expired streaming key for presentation bot: ${streamingKey.substring(0, 8)}...`)
      throw new ExpiredStreamingKeyError()
    }

    const roomId = streamAccess.room_id!
    const botIdentity = `presentation-bot:${roomId}:${Date.now()}`

    const credentials = await livekit.generateCredentials(
      botIdentity,
      roomId,
      {
        canPublish: true,
        canSubscribe: true,
        canUpdateOwnMetadata: false, // Only server can update metadata
        cast: [botIdentity]
      },
      false,
      {
        role: 'presentation'
      }
    )

    logger.info(`Presentation bot token generated for room ${roomId}`, {
      botIdentity,
      roomId,
      placeId: streamAccess.place_id
    })

    return {
      url: credentials.url,
      token: credentials.token,
      roomId
    }
  }

  /**
   * Validates that the caller is an admin for the scene associated with the given room.
   * Skips validation for local preview rooms.
   *
   * @param roomId - LiveKit room identifier
   * @param callerAddress - Ethereum address of the caller
   * @throws {NoActiveStreamError} If no active stream exists for the room
   * @throws {NotSceneAdminError} If the caller is not a scene admin
   */
  async function validatePresenterAdmin(roomId: string, callerAddress: string): Promise<void> {
    const streamAccess = await sceneStreamAccessManager.getAccessByRoomId(roomId)
    if (!streamAccess) {
      throw new NoActiveStreamError(roomId)
    }

    // Local preview: synthetic place IDs don't exist in the Places API — skip admin check
    const { realmName } = livekit.getRoomMetadataFromRoomName(roomId)
    if (livekit.isLocalPreview(realmName)) {
      return
    }

    const [place] = await places.getPlaceStatusByIds([streamAccess.place_id])
    if (!place) {
      throw new NoActiveStreamError(roomId)
    }
    const isAdmin = await sceneManager.isSceneOwnerOrAdmin(place as PlaceAttributes, callerAddress)
    if (!isAdmin) {
      throw new NotSceneAdminError('Only scene administrators can manage presenters')
    }
  }

  /**
   * Adds a participant to the presenters list in room metadata.
   * Idempotent — calling twice with the same identity has no additional effect.
   *
   * @param roomId - LiveKit room identifier
   * @param identity - Ethereum address of the participant to add
   */
  async function addPresenter(roomId: string, identity: string): Promise<void> {
    // Ensure room exists (e.g., streamer token generated before connecting)
    await livekit.getRoom(roomId)
    // Fetch latest room state from LiveKit server instead of reusing a cached Room object.
    // Webhook handlers (e.g., refreshRoomBans on participant-joined) may pass stale Room
    // snapshots to updateRoomMetadata, causing a read-stale-write that overwrites our
    // presenters key. By not passing a Room object, updateRoomMetadata fetches the latest
    // metadata from LiveKit before merging, avoiding the race condition.
    const room = await livekit.getRoomInfo(roomId)
    const roomMeta = JSON.parse(room?.metadata || '{}')
    const presenters: string[] = roomMeta.presenters || []
    if (!presenters.includes(identity)) {
      presenters.push(identity)
      await livekit.updateRoomMetadata(roomId, { presenters })
      logger.info(`Added ${identity} to presenters in room ${roomId}`)
    }
  }

  /**
   * Removes a participant from the presenters list in room metadata.
   *
   * @param roomId - LiveKit room identifier
   * @param identity - Ethereum address of the participant to remove
   */
  async function removePresenter(roomId: string, identity: string): Promise<void> {
    const room = await livekit.getRoomInfo(roomId)
    const roomMeta = JSON.parse(room?.metadata || '{}')
    const presenters: string[] = (roomMeta.presenters || []).filter((id: string) => id !== identity)
    await livekit.updateRoomMetadata(roomId, { presenters })
    logger.info(`Removed ${identity} from presenters in room ${roomId}`)
  }

  /**
   * Promotes a participant to the presenter role within a cast room.
   * Validates that the caller is a scene admin before updating room metadata.
   *
   * @param roomId - LiveKit room identifier
   * @param participantIdentity - Ethereum address of the participant to promote
   * @param callerAddress - Ethereum address of the caller
   * @throws {NoActiveStreamError} If the room has no active stream
   * @throws {NotSceneAdminError} If the caller is not a scene admin
   */
  async function promotePresenter(roomId: string, participantIdentity: string, callerAddress: string): Promise<void> {
    await validatePresenterAdmin(roomId, callerAddress)
    await addPresenter(roomId, participantIdentity)
  }

  /**
   * Demotes a presenter back to watcher role within a cast room.
   *
   * @param roomId - LiveKit room identifier
   * @param participantIdentity - Ethereum address of the participant to demote
   * @param callerAddress - Ethereum address of the caller
   * @throws {NoActiveStreamError} If the room has no active stream
   * @throws {NotSceneAdminError} If the caller is not a scene admin
   */
  async function demotePresenter(roomId: string, participantIdentity: string, callerAddress: string): Promise<void> {
    await validatePresenterAdmin(roomId, callerAddress)
    await removePresenter(roomId, participantIdentity)
  }

  /**
   * Returns the list of participants with the presenter role in a cast room.
   * Reads from room metadata (server-authoritative source of truth).
   *
   * @param roomId - LiveKit room identifier
   * @param callerAddress - Ethereum address of the caller
   * @returns Object containing an array of presenter identities
   * @throws {NoActiveStreamError} If the room has no active stream
   * @throws {NotSceneAdminError} If the caller is not a scene admin
   */
  async function getPresenters(roomId: string, callerAddress: string): Promise<GetPresentersResult> {
    await validatePresenterAdmin(roomId, callerAddress)
    const room = await livekit.getRoomInfo(roomId)
    const roomMeta = JSON.parse(room?.metadata || '{}')
    return { presenters: roomMeta.presenters || [] }
  }

  return {
    addPresenter,
    generateStreamLink,
    generatePreviewStreamLink,
    validateStreamerToken,
    generateWatcherCredentials,
    generateWatcherCredentialsByLocation,
    generatePresentationBotToken,
    promotePresenter,
    demotePresenter,
    getPresenters
  }
}
