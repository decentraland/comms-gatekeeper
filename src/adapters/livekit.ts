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
  ParticipantPermissions,
  SceneRoomMetadata
} from '../types/livekit.type'
import { isErrorWithMessage } from '../logic/errors'

export async function createLivekitComponent(
  components: Pick<AppComponents, 'config' | 'logs'>
): Promise<ILivekitComponent> {
  const { config, logs } = components

  const logger = logs.getLogger('livekit-adapter')

  // Check if LiveKit is disabled
  const isLivekitDisabled = await config.getString('DISABLE_LIVEKIT')
  if (isLivekitDisabled === 'true') {
    logger.info('LiveKit integration is disabled - creating no-op component')
    return createNoOpLivekitComponent({ config, logs })
  }

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

  function getSceneRoomMetadataFromRoomName(roomName: string): SceneRoomMetadata {
    const [realmName, sceneId] = roomName.includes(sceneRoomPrefix)
      ? roomName.replace(`${sceneRoomPrefix}`, '').split(':')
      : []
    const worldName = roomName.includes(worldRoomPrefix) ? roomName.replace(`${worldRoomPrefix}`, '') : undefined
    return { realmName, sceneId, worldName }
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
    generateCredentials,
    getWorldRoomName,
    getSceneRoomName,
    getSceneRoomMetadataFromRoomName,
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

// No-op implementation when LiveKit is disabled
async function createNoOpLivekitComponent(
  components: Pick<AppComponents, 'config' | 'logs'>
): Promise<ILivekitComponent> {
  const { config, logs } = components
  const logger = logs.getLogger('livekit-adapter-noop')

  const [worldRoomPrefix, sceneRoomPrefix] = await Promise.all([
    config.getString('WORLD_ROOM_PREFIX') || 'world-',
    config.getString('SCENE_ROOM_PREFIX') || 'scene-'
  ])

  function logNoOpWarning(operation: string) {
    logger.warn(`LiveKit operation '${operation}' called but LiveKit is disabled - no-op`)
  }

  // Helper to create mock Room object
  function createMockRoom(name: string): Room {
    return {
      sid: 'disabled-room-sid',
      name,
      emptyTimeout: 300,
      maxParticipants: 100,
      creationTime: BigInt(Date.now() * 1000000), // Convert to nanoseconds
      turnPassword: '',
      enabledCodecs: [],
      metadata: '{}',
      numParticipants: 0,
      numPublishers: 0,
      activeRecording: false
    } as Room
  }

  // Helper to create mock IngressInfo
  function createMockIngress(roomName: string, participantIdentity: string): IngressInfo {
    return {
      ingressId: 'disabled-ingress-id',
      name: `${roomName}-ingress`,
      streamKey: 'disabled-stream-key',
      url: 'rtmp://disabled.livekit.io/live',
      inputType: 0, // RTMP_INPUT
      roomName,
      participantIdentity,
      participantName: participantIdentity,
      reusable: false,
      state: {
        status: 1, // ENDPOINT_INACTIVE
        error: '',
        video: undefined,
        audio: undefined,
        roomId: '',
        startedAt: undefined,
        endedAt: undefined,
        updatedAt: BigInt(Date.now() * 1000000), // Convert to nanoseconds
        resourceId: '',
        tracks: []
      } as any
    } as IngressInfo
  }

  return {
    async deleteRoom(_roomName: string): Promise<void> {
      logNoOpWarning('deleteRoom')
    },

    buildConnectionUrl(_url: string, _token: string): string {
      logNoOpWarning('buildConnectionUrl')
      return `livekit:disabled://?access_token=disabled`
    },

    async generateCredentials(
      _identity: string,
      _roomId: string,
      _permissions: Omit<Permissions, 'mute'>,
      _forPreview: boolean,
      _metadata?: Record<string, unknown>
    ): Promise<LivekitCredentials> {
      logNoOpWarning('generateCredentials')
      return {
        url: 'wss://disabled.livekit.io',
        token: 'disabled-token'
      }
    },

    async muteParticipant(_roomId: string, _participantId: string): Promise<void> {
      logNoOpWarning('muteParticipant')
    },

    async removeParticipant(_roomId: string, _participantId: string): Promise<void> {
      logNoOpWarning('removeParticipant')
    },

    getWorldRoomName(worldName: string): string {
      return `${worldRoomPrefix}${worldName}`
    },

    getSceneRoomName(realmName: string, sceneId: string): string {
      return `${sceneRoomPrefix}${realmName}:${sceneId}`
    },

    getSceneRoomMetadataFromRoomName(roomName: string): SceneRoomMetadata {
      const [realmName, sceneId] = roomName.includes(sceneRoomPrefix)
        ? roomName.replace(`${sceneRoomPrefix}`, '').split(':')
        : []
      const worldName = roomName.includes(worldRoomPrefix) ? roomName.replace(`${worldRoomPrefix}`, '') : undefined
      return { realmName, sceneId, worldName }
    },

    getRoomName(realmName: string, params: GetRoomNameParams): string {
      const { isWorld, sceneId } = params
      if (isWorld) {
        return `${worldRoomPrefix}${realmName}`
      } else {
        if (!sceneId) {
          throw new Error('No sceneId provided for scene room')
        }
        return `${sceneRoomPrefix}${realmName}:${sceneId}`
      }
    },

    async getRoom(roomName: string): Promise<Room> {
      logNoOpWarning('getRoom')
      return createMockRoom(roomName)
    },

    async getRoomInfo(roomName: string): Promise<Room | null> {
      logNoOpWarning('getRoomInfo')
      return createMockRoom(roomName)
    },

    async getOrCreateIngress(roomName: string, participantIdentity: string): Promise<IngressInfo> {
      logNoOpWarning('getOrCreateIngress')
      return createMockIngress(roomName, participantIdentity)
    },

    async removeIngress(_ingressId: string): Promise<IngressInfo> {
      logNoOpWarning('removeIngress')
      return createMockIngress('disabled-room', 'disabled-participant')
    },

    async getWebhookEvent(_body: string, _authorization: string) {
      logNoOpWarning('getWebhookEvent')
      throw new Error('LiveKit webhooks are disabled')
    },

    async getParticipantInfo(_roomId: string, _participantId: string): Promise<ParticipantInfo | null> {
      logNoOpWarning('getParticipantInfo')
      return null
    },

    async updateParticipantMetadata(
      _roomId: string,
      _participantId: string,
      _metadata: Record<string, unknown>
    ): Promise<void> {
      logNoOpWarning('updateParticipantMetadata')
    },

    async updateParticipantPermissions(
      _roomId: string,
      _participantId: string,
      _permissions: ParticipantPermissions
    ): Promise<void> {
      logNoOpWarning('updateParticipantPermissions')
    },

    async updateRoomMetadata(_roomId: string, _metadata: Record<string, unknown>, _room?: Room): Promise<void> {
      logNoOpWarning('updateRoomMetadata')
    }
  }
}
