import { IBaseComponent } from '@well-known-components/interfaces'
import { IngressInfo, Room, WebhookEvent } from 'livekit-server-sdk'
import { Permissions } from '../types'

export type LivekitCredentials = {
  token: string
  url: string
}

export type LivekitSettings = {
  host: string
  apiKey: string
  secret: string
}

export type ParticipantPermissions = {
  canPublish?: boolean
  canSubscribe?: boolean
  canPublishData?: boolean
}

export type ILivekitComponent = IBaseComponent & {
  deleteRoom: (roomName: string) => Promise<void>
  buildConnectionUrl: (url: string, token: string) => string
  generateCredentials: (
    identity: string,
    roomId: string,
    permissions: Omit<Permissions, 'mute'>,
    forPreview: boolean,
    metadata?: Record<string, unknown>
  ) => Promise<LivekitCredentials>
  muteParticipant: (roomId: string, participantId: string) => Promise<void>
  removeParticipant: (roomId: string, participantId: string) => Promise<void>
  getWorldRoomName: (worldName: string) => string
  getSceneRoomName: (realmName: string, sceneId: string) => string
  getRoom: (roomName: string) => Promise<Room>
  getRoomInfo: (roomName: string) => Promise<Room | null>
  getOrCreateIngress: (roomName: string, participantIdentity: string) => Promise<IngressInfo>
  removeIngress: (ingressId: string) => Promise<IngressInfo>
  getWebhookEvent: (body: string, authorization: string) => Promise<WebhookEvent>
  updateParticipantMetadata: (roomId: string, participantId: string, metadata: Record<string, unknown>) => Promise<void>
  updateParticipantPermissions: (
    roomId: string,
    participantId: string,
    permissions: ParticipantPermissions
  ) => Promise<void>
}
