import { IBaseComponent } from '@well-known-components/interfaces'
import { IngressInfo, Room, WebhookEvent, ParticipantInfo } from 'livekit-server-sdk'
import { Permissions } from '../types'
import { RoomType } from '@dcl/schemas'

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

export type RoomMetadata = {
  communityId?: string
  voiceChatId?: string
  islandName?: string
  realmName?: string
  sceneId?: string
  worldName?: string
  roomType: RoomType
}

export type GetRoomNameParams = { isWorld: boolean; sceneId?: string }

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
  getPrivateVoiceChatRoomName: (roomId: string) => string
  getCallIdFromRoomName: (roomName: string) => string
  getCommunityVoiceChatRoomName: (communityId: string) => string
  getCommunityIdFromRoomName: (roomName: string) => string
  getRoomMetadataFromRoomName: (roomName: string) => RoomMetadata
  getRoomName: (realmName: string, params: GetRoomNameParams) => string
  getRoom: (roomName: string) => Promise<Room>
  getRoomInfo: (roomName: string) => Promise<Room | null>
  getOrCreateIngress: (roomName: string, participantIdentity: string) => Promise<IngressInfo>
  removeIngress: (ingressId: string) => Promise<IngressInfo>
  getWebhookEvent: (body: string, authorization: string) => Promise<WebhookEvent>
  getParticipantInfo: (roomId: string, participantId: string) => Promise<ParticipantInfo | null>
  updateParticipantMetadata: (roomId: string, participantId: string, metadata: Record<string, unknown>) => Promise<void>
  updateParticipantPermissions: (
    roomId: string,
    participantId: string,
    permissions: ParticipantPermissions
  ) => Promise<void>
  updateRoomMetadata: (roomId: string, metadata: Record<string, unknown>, room?: Room) => Promise<void>
}
