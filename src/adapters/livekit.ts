import {
  AccessToken,
  CreateIngressOptions,
  IngressClient,
  IngressInfo,
  IngressInput,
  ParticipantInfo,
  Room,
  RoomServiceClient,
  TrackSource,
  WebhookReceiver
} from 'livekit-server-sdk'
import { RoomType } from '@dcl/schemas'
import { AppComponents, Permissions } from '../types'
import {
  GetRoomNameParams,
  ILivekitComponent,
  LivekitCredentials,
  LivekitSettings,
  ParticipantPermissions,
  RoomMetadata
} from '../types/livekit.type'
import { isErrorWithMessage } from '../logic/errors'

export const COMMUNITY_VOICE_CHAT_ROOM_PREFIX = 'voice-chat-community'
export const PRIVATE_VOICE_CHAT_ROOM_PREFIX = 'voice-chat-private-'
export const ISLAND_ROOM_PREFIX = 'island-'

export async function createLivekitComponent(
  components: Pick<AppComponents, 'config' | 'logs'>
): Promise<ILivekitComponent> {
  const { config, logs } = components

  const logger = logs.getLogger('livekit-adapter')

  const [
    commsRoomPrefix,
    worldRoomPrefix,
    sceneRoomPrefix,
    prodHost,
    privateMessagesRoomId,
    prodApiKey,
    prodSecret,
    previewHost,
    previewApiKey,
    previewSecret,
    allowLocalPreview
  ] = await Promise.all([
    config.requireString('COMMS_ROOM_PREFIX'),
    config.requireString('WORLD_ROOM_PREFIX'),
    config.requireString('SCENE_ROOM_PREFIX'),
    config.requireString('PROD_LIVEKIT_HOST'),
    config.requireString('PRIVATE_MESSAGES_ROOM_ID'),
    config.requireString('PROD_LIVEKIT_API_KEY'),
    config.requireString('PROD_LIVEKIT_API_SECRET'),
    config.requireString('PREVIEW_LIVEKIT_HOST'),
    config.requireString('PREVIEW_LIVEKIT_API_KEY'),
    config.requireString('PREVIEW_LIVEKIT_API_SECRET'),
    config.getString('ALLOW_LOCAL_PREVIEW')
  ])

  const normalizedProdHost = !prodHost.startsWith('wss://') ? `wss://${prodHost}` : prodHost

  const normalizedPreviewHost = !previewHost.startsWith('wss://') ? `wss://${previewHost}` : previewHost

  const prodSettings: LivekitSettings = { host: normalizedProdHost, apiKey: prodApiKey, secret: prodSecret }
  const previewSettings: LivekitSettings = { host: normalizedPreviewHost, apiKey: previewApiKey, secret: previewSecret }

  const roomClient = new RoomServiceClient(normalizedProdHost, prodApiKey, prodSecret)
  const ingressClient = new IngressClient(normalizedProdHost, prodApiKey, prodSecret)
  const receiver = new WebhookReceiver(prodApiKey, prodSecret)

  async function generateCredentials(
    identity: string,
    roomId: string,
    permissions: Omit<Permissions, 'mute'>,
    forPreview: boolean,
    metadata?: Record<string, unknown>
  ): Promise<LivekitCredentials> {
    const settings = forPreview ? previewSettings : prodSettings
    const allSources = permissions.cast.includes(identity)
    const name = metadata?.displayName as string | undefined
    const token = new AccessToken(settings.apiKey, settings.secret, {
      identity,
      name,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      ttl: 5 * 60 // 5 minutes
    })

    const canPublishSources = allSources ? undefined : [TrackSource.MICROPHONE]
    token.addGrant({
      roomJoin: true,
      room: roomId,
      roomList: false,
      canPublish: permissions.canPublish ?? true,
      canSubscribe: permissions.canSubscribe ?? true,
      canPublishData: true,
      canUpdateOwnMetadata: permissions.canUpdateOwnMetadata ?? true,
      canPublishSources
    })

    return {
      url: settings.host,
      token: await token.toJwt()
    }
  }

  const LOCAL_PREVIEW_REALM_NAMES = ['localpreview', 'preview']

  /**
   * Checks if the given realm name indicates a local preview environment.
   * Returns false when the ALLOW_LOCAL_PREVIEW config flag is not enabled.
   */
  function isLocalPreview(realmName: string | undefined): boolean {
    if (allowLocalPreview !== 'true') return false
    if (!realmName) return false
    return LOCAL_PREVIEW_REALM_NAMES.includes(realmName.toLowerCase())
  }

  /**
   * Gets the world room name without sceneId.
   * Used for world-wide operations like getting all participants in a world.
   * Uses the COMMS_ROOM_PREFIX which matches the world content server prefix.
   */
  function getWorldRoomName(worldName: string): string {
    return `${commsRoomPrefix}${worldName}`
  }

  /**
   * Gets the world scene room name with sceneId.
   * Used for scene-specific operations within a world.
   */
  function getWorldSceneRoomName(worldName: string, sceneId: string): string {
    return `${worldRoomPrefix}${worldName}-${sceneId}`
  }

  function getSceneRoomName(realmName: string, sceneId: string): string {
    return `${sceneRoomPrefix}${realmName}:${sceneId}`
  }

  function getPrivateVoiceChatRoomName(roomId: string): string {
    return `${PRIVATE_VOICE_CHAT_ROOM_PREFIX}${roomId}`
  }

  function getCallIdFromRoomName(roomName: string): string {
    return roomName.replace(PRIVATE_VOICE_CHAT_ROOM_PREFIX, '')
  }

  function getCommunityVoiceChatRoomName(communityId: string): string {
    return `${COMMUNITY_VOICE_CHAT_ROOM_PREFIX}-${communityId}`
  }

  function getCommunityIdFromRoomName(roomName: string): string {
    return roomName.replace(`${COMMUNITY_VOICE_CHAT_ROOM_PREFIX}-`, '')
  }

  function getIslandNameFromRoomName(roomName: string): string {
    return roomName.replace(ISLAND_ROOM_PREFIX, '')
  }

  function getRoomMetadataFromRoomName(roomName: string): RoomMetadata {
    // Scene room: {sceneRoomPrefix}{realmName}:{sceneId}
    if (roomName.startsWith(sceneRoomPrefix)) {
      const [realmName, sceneId] = roomName.replace(sceneRoomPrefix, '').split(':')
      return { realmName, sceneId, roomType: RoomType.SCENE }
    }

    // World scene room: {worldRoomPrefix}{worldName}-{sceneId}
    if (roomName.startsWith(worldRoomPrefix)) {
      const parts = roomName.replace(worldRoomPrefix, '')
      const lastDashIndex = parts.lastIndexOf('-')
      if (lastDashIndex !== -1) {
        const worldName = parts.substring(0, lastDashIndex)
        const sceneId = parts.substring(lastDashIndex + 1)
        return { worldName, sceneId, roomType: RoomType.WORLD }
      }
      // Fallback for legacy format without sceneId
      return { worldName: parts, roomType: RoomType.WORLD }
    }

    // World room (comms prefix): {commsRoomPrefix}{worldName}
    if (commsRoomPrefix && roomName.startsWith(commsRoomPrefix)) {
      const worldName = roomName.slice(commsRoomPrefix.length)
      return { worldName, roomType: RoomType.WORLD }
    }

    // Island room: island-{islandName}
    if (roomName.startsWith(ISLAND_ROOM_PREFIX)) {
      const islandName = getIslandNameFromRoomName(roomName)
      return { islandName, roomType: RoomType.ISLAND }
    }

    // Community voice chat: {COMMUNITY_VOICE_CHAT_ROOM_PREFIX}-{communityId}
    if (roomName.startsWith(COMMUNITY_VOICE_CHAT_ROOM_PREFIX)) {
      const communityId = getCommunityIdFromRoomName(roomName)
      return { communityId, roomType: RoomType.COMMUNITY_VOICE_CHAT }
    }

    // Private voice chat: voice-chat-private-{callId}
    if (roomName.startsWith(PRIVATE_VOICE_CHAT_ROOM_PREFIX)) {
      const voiceChatId = getCallIdFromRoomName(roomName)
      return { voiceChatId, roomType: RoomType.VOICE_CHAT }
    }

    // Private messages: private-messages
    if (roomName.startsWith(privateMessagesRoomId)) {
      return { roomType: RoomType.PRIVATE_MESSAGE }
    }

    // Unknown room type
    return { roomType: RoomType.UNKNOWN }
  }

  function getRoomName(realmName: string, params: GetRoomNameParams): string {
    const { isWorld, sceneId } = params

    if (isWorld) {
      return getWorldSceneRoomName(realmName, sceneId)
    } else {
      return getSceneRoomName(realmName, sceneId)
    }
  }

  async function muteParticipant(roomId: string, participantId: string): Promise<void> {
    await roomClient.updateParticipant(roomId, participantId, undefined, {
      canPublishSources: []
    })
  }

  async function removeParticipant(roomId: string, participantId: string): Promise<void> {
    await roomClient.removeParticipant(roomId, participantId)
  }

  async function removeParticipantFromAllRooms(participantIdentity: string): Promise<void> {
    const rooms = await roomClient.listRooms()
    await Promise.all(
      rooms.map(async (room) => {
        try {
          await roomClient.removeParticipant(room.name, participantIdentity)
          logger.info(`Removed ${participantIdentity} from room ${room.name}`)
        } catch (error: any) {
          // LiveKit throws a TwirpError with code 'not_found' when the participant is not in the room
          if (error?.code !== 'not_found') {
            logger.warn(`Failed to remove ${participantIdentity} from room ${room.name}`, {
              error: isErrorWithMessage(error) ? error.message : 'Unknown error'
            })
          }
        }
      })
    )
  }

  async function deleteRoom(roomName: string): Promise<void> {
    logger.info(`Deleting room ${roomName}`)
    try {
      await roomClient.deleteRoom(roomName)
    } catch (error) {
      logger.warn(`Error destroying room ${roomName}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`)
    }
  }

  async function getRoom(roomName: string): Promise<Room> {
    const existingRoom = await roomClient.listRooms([roomName])

    let room
    if (existingRoom.length > 0) {
      room = existingRoom[0]
    } else {
      room = await roomClient.createRoom({
        name: roomName
      })
    }

    return room
  }

  async function getRoomInfo(roomName: string): Promise<Room | null> {
    try {
      const existingRooms = await roomClient.listRooms([roomName])
      return existingRooms.length > 0 ? existingRooms[0] : null
    } catch (error) {
      logger.warn(
        `Error getting room info for ${roomName}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      return null
    }
  }

  async function getOrCreateIngress(roomName: string, participantIdentity: string): Promise<IngressInfo> {
    const ingresses = await ingressClient.listIngress({
      roomName: roomName
    })

    const ingressOptions: CreateIngressOptions = {
      name: `${roomName}-ingress`,
      roomName: roomName,
      participantIdentity
    }

    let ingress: IngressInfo
    if (ingresses.length > 0) {
      ingress = ingresses[0]
    } else {
      ingress = await ingressClient.createIngress(IngressInput.RTMP_INPUT, ingressOptions)
      logger.info(`Ingress created for room ${roomName}.`, { ingress: JSON.stringify(ingress) })
    }

    return ingress
  }

  async function removeIngress(ingressId: string): Promise<IngressInfo | undefined> {
    try {
      return await ingressClient.deleteIngress(ingressId)
    } catch (error: any) {
      if (error?.code === 'not_found' || error?.status === 404) {
        logger.warn(`Ingress ${ingressId} not found in LiveKit, it may have already been deleted`)
        return undefined
      }
      logger.error(`Error removing ingress ${ingressId}:`, { error: JSON.stringify(error) })
      throw error
    }
  }

  async function getParticipantInfo(roomId: string, participantId: string): Promise<ParticipantInfo | null> {
    try {
      const participants = await roomClient.listParticipants(roomId)
      return participants.find((p) => p.identity === participantId) || null
    } catch (error) {
      logger.warn(
        `Error getting participant info for ${participantId} in room ${roomId}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }`
      )
      return null
    }
  }

  async function listRoomParticipants(roomName: string): Promise<ParticipantInfo[]> {
    try {
      return await roomClient.listParticipants(roomName)
    } catch (error) {
      logger.warn(
        `Error listing participants for room ${roomName}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      return []
    }
  }

  async function updateParticipantMetadata(
    roomId: string,
    participantId: string,
    newMetadata: Record<string, unknown>
  ): Promise<void> {
    try {
      // Get existing participant metadata
      const participant = await getParticipantInfo(roomId, participantId)
      let existingMetadata: Record<string, unknown> = {}

      if (participant?.metadata) {
        try {
          existingMetadata = JSON.parse(participant.metadata)
        } catch (error) {
          logger.warn(
            `Error parsing existing metadata for participant ${participantId}: ${
              isErrorWithMessage(error) ? error.message : 'Unknown error'
            }`
          )
          existingMetadata = {}
        }
      }

      // Merge existing metadata with new metadata
      const mergedMetadata = { ...existingMetadata, ...newMetadata }

      await roomClient.updateParticipant(roomId, participantId, JSON.stringify(mergedMetadata))
    } catch (error) {
      logger.error(
        `Error updating participant metadata for ${participantId} in room ${roomId}: ${
          isErrorWithMessage(error) ? error.message : 'Unknown error'
        }`
      )
      throw error
    }
  }

  async function updateParticipantPermissions(
    roomId: string,
    participantId: string,
    permissions: ParticipantPermissions
  ): Promise<void> {
    await roomClient.updateParticipant(roomId, participantId, undefined, permissions)
  }

  /**
   * Per-room promise chain that serializes metadata writes within this process.
   *
   * LiveKit's updateRoomMetadata does a full replace — there are no atomic updates.
   * All our metadata functions (updateRoomMetadata, appendToRoomMetadataArray,
   * removeFromRoomMetadataArray) follow a read-modify-write pattern. Without
   * serialization, concurrent writes to the same room race: both read the same
   * state, both write, and the last write silently overwrites the first.
   *
   * Example: a participant-joined webhook triggers refreshRoomBans (writes
   * bannedAddresses) at the same time as addPresenter (writes presenters).
   * Without the lock, the second write can erase the first's changes.
   *
   * The lock works by chaining promises per room via .then(). Operations on
   * room "A" execute sequentially (1 → 2 → 3), while room "B" operations
   * run independently in parallel. The .then(fn, fn) pattern ensures the chain
   * continues even if an operation fails, preventing deadlocks. The Map entry
   * is cleaned up when the last operation in the chain completes.
   */
  const roomMetadataLocks = new Map<string, Promise<void>>()

  async function withRoomMetadataLock(roomId: string, fn: () => Promise<void>): Promise<void> {
    const previous = roomMetadataLocks.get(roomId) ?? Promise.resolve()
    const current = previous.then(fn, fn)
    roomMetadataLocks.set(roomId, current)
    try {
      await current
    } finally {
      if (roomMetadataLocks.get(roomId) === current) {
        roomMetadataLocks.delete(roomId)
      }
    }
  }

  function parseRoomMetadata(metadataStr: string | undefined): Record<string, unknown> {
    if (!metadataStr) return {}
    try {
      return JSON.parse(metadataStr)
    } catch {
      return {}
    }
  }

  /**
   * Merges the provided metadata keys into the room's existing metadata and writes back.
   * Serialized per-room via withRoomMetadataLock to prevent concurrent overwrites.
   *
   * @param roomId - LiveKit room identifier
   * @param metadata - Key-value pairs to merge into existing room metadata
   */
  async function updateRoomMetadata(roomId: string, metadata: Record<string, unknown>): Promise<void> {
    await withRoomMetadataLock(roomId, async () => {
      try {
        const roomInfo = await getRoomInfo(roomId)
        const existingMetadata = parseRoomMetadata(roomInfo?.metadata)
        const mergedMetadata = { ...existingMetadata, ...metadata }
        await roomClient.updateRoomMetadata(roomId, JSON.stringify(mergedMetadata))
      } catch (error) {
        logger.error(
          `Error updating room metadata for room ${roomId}: ${
            isErrorWithMessage(error) ? error.message : 'Unknown error'
          }`
        )
        throw error
      }
    })
  }

  /**
   * Adds a value to an array field in room metadata.
   * Serialized per-room to prevent concurrent writes from overwriting each other.
   *
   * @param roomId - LiveKit room identifier
   * @param field - The metadata field name (e.g., 'presenters')
   * @param value - The value to append to the array
   */
  async function appendToRoomMetadataArray(roomId: string, field: string, value: string): Promise<void> {
    await withRoomMetadataLock(roomId, async () => {
      const roomInfo = await getRoomInfo(roomId)
      const existingMetadata = parseRoomMetadata(roomInfo?.metadata)
      const arr: string[] = Array.isArray(existingMetadata[field]) ? (existingMetadata[field] as string[]) : []
      if (!arr.includes(value)) {
        arr.push(value)
        existingMetadata[field] = arr
        await roomClient.updateRoomMetadata(roomId, JSON.stringify(existingMetadata))
      }
    })
  }

  /**
   * Removes a value from an array field in room metadata.
   * Serialized per-room to prevent concurrent writes from overwriting each other.
   *
   * @param roomId - LiveKit room identifier
   * @param field - The metadata field name (e.g., 'presenters')
   * @param value - The value to remove from the array
   */
  async function removeFromRoomMetadataArray(roomId: string, field: string, value: string): Promise<void> {
    await withRoomMetadataLock(roomId, async () => {
      const roomInfo = await getRoomInfo(roomId)
      if (!roomInfo) return
      const existingMetadata = parseRoomMetadata(roomInfo.metadata)
      const arr: string[] = Array.isArray(existingMetadata[field]) ? (existingMetadata[field] as string[]) : []
      const filtered = arr.filter((item) => item !== value)
      if (filtered.length === arr.length) return
      existingMetadata[field] = filtered
      await roomClient.updateRoomMetadata(roomId, JSON.stringify(existingMetadata))
    })
  }

  async function getWebhookEvent(body: string, authorization: string) {
    return receiver.receive(body, authorization)
  }

  function buildConnectionUrl(url: string, token: string): string {
    return `livekit:${url}?access_token=${token}`
  }

  return {
    buildConnectionUrl,
    deleteRoom,
    isLocalPreview,
    updateParticipantMetadata,
    updateParticipantPermissions,
    updateRoomMetadata,
    appendToRoomMetadataArray,
    removeFromRoomMetadataArray,
    getParticipantInfo,
    listRoomParticipants,
    generateCredentials,
    getWorldRoomName,
    getWorldSceneRoomName,
    getSceneRoomName,
    getPrivateVoiceChatRoomName,
    getCallIdFromRoomName,
    getCommunityVoiceChatRoomName,
    getCommunityIdFromRoomName,
    getIslandNameFromRoomName,
    getRoomMetadataFromRoomName,
    getRoomName,
    muteParticipant,
    removeParticipant,
    removeParticipantFromAllRooms,
    getRoom,
    getRoomInfo,
    getOrCreateIngress,
    removeIngress,
    getWebhookEvent
  }
}
