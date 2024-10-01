import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents, LivekitCredentials, Permissions } from '../types'
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'

export type LivekitSettings = {
  host: string
  apiKey: string
  secret: string
}

export type ILivekitComponent = IBaseComponent & {
  generateCredentials: (
    identity: string,
    roomId: string,
    permissons: Permissions,
    forPreview: boolean
  ) => Promise<LivekitCredentials>
  muteParticipant: (roomId: string, participantId: string) => Promise<void>
  getWorldRoomName: (worldName: string) => string
  getSceneRoomName: (realmName: string, sceneId: string) => string
}

export async function createLivekitComponent(
  components: Pick<AppComponents, 'config' | 'logs'>
): Promise<ILivekitComponent> {
  const { config } = components

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

  const prodSettings: LivekitSettings = { host: prodHost, apiKey: prodApiKey, secret: prodSecret }
  const previewSettings: LivekitSettings = { host: previewHost, apiKey: previewApiKey, secret: previewSecret }

  async function generateCredentials(
    identity: string,
    roomId: string,
    permissons: Permissions,
    forPreview: boolean
  ): Promise<LivekitCredentials> {
    const settings = forPreview ? previewSettings : prodSettings
    const allSources = permissons.cast.includes(identity)
    const token = new AccessToken(settings.apiKey, settings.secret, {
      identity,
      ttl: 5 * 60 // 5 minutes
    })

    const canPublishSources = allSources ? undefined : [TrackSource.MICROPHONE]
    token.addGrant({
      roomJoin: true,
      room: roomId,
      roomList: false,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true,
      canPublishSources
    })

    return {
      url: `wss://${settings.host}`,
      token: token.toJwt()
    }
  }

  function getWorldRoomName(worldName: string): string {
    return `${worldRoomPrefix}${worldName}`
  }

  function getSceneRoomName(realmName: string, sceneId: string): string {
    return `${sceneRoomPrefix}${realmName}:${sceneId}`
  }

  const client = new RoomServiceClient(prodHost, prodApiKey, prodSecret)

  async function muteParticipant(roomId: string, participantId: string): Promise<void> {
    await client.updateParticipant(roomId, participantId, undefined, {
      canPublishSources: []
    })
  }

  return {
    generateCredentials,
    getWorldRoomName,
    getSceneRoomName,
    muteParticipant
  }
}
