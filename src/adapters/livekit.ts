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
import { LivekitIngressNotFoundError } from '../types/errors'
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
    worldRoomPrefix,
    sceneRoomPrefix,
    prodHost,
    privateMessagesRoomId,
    prodApiKey,
    prodSecret,
    previewHost,
    previewApiKey,
    previewSecret
  ] = await Promise.all([
    config.requireString('WORLD_ROOM_PREFIX'),
    config.requireString('SCENE_ROOM_PREFIX'),
    config.requireString('PROD_LIVEKIT_HOST'),
    config.requireString('PRIVATE_MESSAGES_ROOM_ID'),
    config.requireString('PROD_LIVEKIT_API_KEY'),
    config.requireString('PROD_LIVEKIT_API_SECRET'),
    config.requireString('PREVIEW_LIVEKIT_HOST'),
    config.requireString('PREVIEW_LIVEKIT_API_KEY'),
    config.requireString('PREVIEW_LIVEKIT_API_SECRET')
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
    const token = new AccessToken(settings.apiKey, settings.secret, {
      identity,
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

  function getWorldRoomName(worldName: string): string {
    return `${worldRoomPrefix}${worldName}`
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

    // World scene room: {worldRoomPrefix}{worldName}
    if (roomName.startsWith(worldRoomPrefix)) {
      const worldName = roomName.replace(worldRoomPrefix, '')
      return { worldName, roomType: RoomType.WORLD }
    }

    // World room: just the domain (e.g., juan.dcl.eth or juan.eth)
    if (roomName.endsWith('.eth')) {
      return { worldName: roomName, roomType: RoomType.WORLD }
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
      return getWorldRoomName(realmName)
    } else {
      if (!sceneId) {
        throw new Error('No sceneId provided for scene room')
      }

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

  async function removeIngress(ingressId: string): Promise<IngressInfo> {
    try {
      return ingressClient.deleteIngress(ingressId)
    } catch (error) {
      logger.debug(`Error removing ingress ${ingressId}:`, { error: JSON.stringify(error) })
      throw new LivekitIngressNotFoundError(`No ingress found`)
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

  async function updateRoomMetadata(roomId: string, metadata: Record<string, unknown>, room?: Room): Promise<void> {
    try {
      // Use provided room or get room info
      const roomInfo = room || (await getRoomInfo(roomId))
      let existingMetadata: Record<string, unknown> = {}

      if (roomInfo?.metadata) {
        try {
          existingMetadata = JSON.parse(roomInfo.metadata)
        } catch (error) {
          logger.warn(
            `Error parsing existing room metadata for room ${roomId}: ${
              isErrorWithMessage(error) ? error.message : 'Unknown error'
            }`
          )
          existingMetadata = {}
        }
      }

      // Merge existing metadata with new metadata
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
    updateParticipantMetadata,
    updateParticipantPermissions,
    updateRoomMetadata,
    getParticipantInfo,
    listRoomParticipants,
    generateCredentials,
    getWorldRoomName,
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
    getRoom,
    getRoomInfo,
    getOrCreateIngress,
    removeIngress,
    getWebhookEvent
  }
}
