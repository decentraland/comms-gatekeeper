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
import { AppComponents, Permissions } from '../types'
import { LivekitIngressNotFoundError } from '../types/errors'
import {
  GetRoomNameParams,
  ILivekitComponent,
  LivekitCredentials,
  LivekitSettings,
  ParticipantPermissions
} from '../types/livekit.type'
import { isErrorWithMessage } from '../logic/errors'

export async function createLivekitComponent(
  components: Pick<AppComponents, 'config' | 'logs'>
): Promise<ILivekitComponent> {
  const { config, logs } = components

  const logger = logs.getLogger('livekit-adapter')

  const [
    worldRoomPrefix,
    sceneRoomPrefix,
    prodHost,
    prodApiKey,
    prodSecret,
    previewHost,
    previewApiKey,
    previewSecret
  ] = await Promise.all([
    config.requireString('WORLD_ROOM_PREFIX'),
    config.requireString('SCENE_ROOM_PREFIX'),
    config.requireString('PROD_LIVEKIT_HOST'),
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

  function getRoomName(realmName: string, params: GetRoomNameParams): string {
    const { isWorlds, sceneId } = params
    if (isWorlds) {
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
    getParticipantInfo,
    generateCredentials,
    getWorldRoomName,
    getSceneRoomName,
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
