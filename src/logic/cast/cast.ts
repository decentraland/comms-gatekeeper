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
  ValidateWatcherTokenResult,
  UpgradePermissionsParams
} from './types'

// Constants
const STREAM_LINK_EXPIRATION_DAYS = 4

export function createCastComponent(
  components: Pick<
    AppComponents,
    'livekit' | 'logs' | 'sceneStreamAccessManager' | 'sceneManager' | 'places' | 'blockList' | 'config'
  >
): ICastComponent {
  const { livekit, logs, sceneStreamAccessManager, sceneManager, places, blockList, config } = components
  const logger = logs.getLogger('cast')

  /**
   * Generates a unique stream link for a scene.
   * @param params - Parameters for generating the stream link
   * @returns Stream link details
   */
  async function generateStreamLink(params: GenerateStreamLinkParams): Promise<GenerateStreamLinkResult> {
    const { walletAddress, worldName, parcel } = params

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

    // Create stream access entry with expiration
    // Note: For Cast 2.0 with WebRTC, we don't use RTMP ingress
    await sceneStreamAccessManager.addAccess({
      place_id: place.id,
      streaming_url: '', // Not used for Cast 2.0 WebRTC
      streaming_key: streamingKey,
      ingress_id: '', // Not used for Cast 2.0 WebRTC
      expiration_time: expirationTime
    })

    // Get Cast2 URL from config
    const cast2BaseUrl = await config.getString('CAST2_URL')

    // Generate the stream link
    const streamLink = `${cast2BaseUrl}/s/${streamingKey}`

    logger.info(`Stream link generated for place ${place.id} by admin ${walletAddress}`, {
      placeId: place.id,
      streamingKey: streamingKey.substring(0, 20) + '...',
      expiresAt: new Date(expirationTime).toISOString(),
      generatedBy: walletAddress
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
    const roomId = `place:${streamAccess.place_id}`

    // Create LiveKit credentials with publish permissions
    const credentials = await livekit.generateCredentials(
      streamerId,
      roomId,
      {
        canPublish: true,
        canSubscribe: true,
        cast: [streamerId] // Grant full casting permissions
      },
      false, // Use production LiveKit
      {
        role: 'streamer',
        placeId: streamAccess.place_id,
        streamingKey
      }
    )

    logger.info(`Streamer token generated for place ${streamAccess.place_id}`, {
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
   * @param roomId - The room ID to join
   * @param identity - The identity for the watcher
   * @returns LiveKit credentials
   */
  async function validateWatcherToken(roomId: string, identity: string): Promise<ValidateWatcherTokenResult> {
    // Generate anonymous identity if not provided
    const watcherId = identity || `watcher:${roomId}:${Date.now()}-${randomUUID().slice(0, 8)}`

    // Create LiveKit credentials with limited permissions (subscribe only)
    const credentials = await livekit.generateCredentials(
      watcherId,
      roomId,
      {
        canPublish: false, // Watchers can't publish video/audio by default
        canSubscribe: true, // Can watch streams
        cast: [] // No casting permissions initially
      },
      false, // Use production LiveKit
      {
        role: 'watcher',
        roomId
      }
    )

    logger.info(`Watcher token generated for room ${roomId}`, {
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

  /**
   * Upgrades a watcher's permissions to allow publishing after wallet verification.
   * @param params - Parameters for upgrading permissions
   */
  async function upgradeParticipantPermissions(params: UpgradePermissionsParams): Promise<void> {
    const { roomId, participantId, walletAddress, signature } = params

    // Basic signature validation (not empty)
    if (!signature || signature.length < 10) {
      logger.warn(`Invalid signature for wallet ${walletAddress}`)
      throw new UnauthorizedError('Invalid wallet signature')
    }

    // Check if wallet is blacklisted
    const isBlacklisted = await blockList.isBlacklisted(walletAddress)
    if (isBlacklisted) {
      logger.warn(`Blocked wallet attempted to upgrade permissions: ${walletAddress}`)
      throw new UnauthorizedError('Access denied, deny-listed wallet')
    }

    // Update participant permissions to allow chat
    await livekit.updateParticipantPermissions(roomId, participantId, {
      canPublishData: true // Now can send chat messages
    })

    // Update participant metadata with wallet info
    await livekit.updateParticipantMetadata(roomId, participantId, {
      walletAddress,
      authenticated: true,
      upgradedAt: Date.now()
    })

    logger.info(`Permissions upgraded for participant ${participantId} in room ${roomId}`, {
      participantId,
      roomId,
      walletAddress
    })
  }

  return {
    generateStreamLink,
    validateStreamerToken,
    validateWatcherToken,
    upgradeParticipantPermissions
  }
}
