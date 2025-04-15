import {
  AccessToken,
  CreateIngressOptions,
  IngressClient,
  IngressInfo,
  IngressInput,
  Room,
  RoomServiceClient,
  TrackSource,
  WebhookReceiver
} from 'livekit-server-sdk'
import { AppComponents, Permissions } from '../types'
import { LivekitIngressNotFoundError } from '../types/errors'
import { ILivekitComponent, LivekitCredentials, LivekitSettings } from '../types/livekit.type'

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

  const roomClient = new RoomServiceClient(prodHost, prodApiKey, prodSecret)
  const ingressClient = new IngressClient(prodHost, prodApiKey, prodSecret)
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

  async function muteParticipant(roomId: string, participantId: string): Promise<void> {
    await roomClient.updateParticipant(roomId, participantId, undefined, {
      canPublishSources: []
    })
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

  async function updateParticipantMetadata(
    roomId: string,
    participantId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await roomClient.updateParticipant(roomId, participantId, JSON.stringify(metadata))
  }

  async function getWebhookEvent(body: string, authorization: string) {
    return receiver.receive(body, authorization)
  }

  return {
    updateParticipantMetadata,
    generateCredentials,
    getWorldRoomName,
    getSceneRoomName,
    muteParticipant,
    getRoom,
    getOrCreateIngress,
    removeIngress,
    getWebhookEvent
  }
}
