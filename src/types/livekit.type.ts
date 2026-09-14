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
  bannedAddresses?: string[]
  sceneAdmins?: string[]
}

export type GetRoomNameParams = { isWorld: boolean; sceneId?: string }

/** One participant found under a queried identity, tagged with its owning comms session. */
export type ParticipantHold = {
  /**
   * The identity exactly as LiveKit listed it - not necessarily the queried identity's casing.
   * Removal must use this string: LiveKit matches identity exactly, and a foreign or legacy
   * mint can be checksum-cased.
   */
  identity: string
  /** Lower-cased `dclsession` attribute, or `null` when the participant carries none. */
  session: string | null
}

export type ILivekitComponent = IBaseComponent & {
  isLocalPreview: (realmName: string | undefined) => boolean
  isPreviewRealmName: (realmName: string | undefined) => boolean
  deleteRoom: (roomName: string) => Promise<void>
  buildConnectionUrl: (url: string, token: string) => string
  generateCredentials: (
    identity: string,
    roomId: string,
    permissions: Omit<Permissions, 'mute'>,
    forPreview: boolean,
    metadata?: Record<string, unknown>,
    /** Custom LiveKit participant attributes, e.g. the owning comms session under `dclsession`. */
    attributes?: Record<string, string>
  ) => Promise<LivekitCredentials>
  muteParticipant: (roomId: string, participantId: string) => Promise<void>
  /**
   * Disconnects a participant from a room.
   *
   * @param roomId - The room to remove them from.
   * @param participantId - The participant's identity.
   * @param revokeTokensMintedBefore - When given, every token for this identity minted before
   * this instant stops working, so the client cannot simply reconnect with the one it holds.
   * Tokens carry an `nbf` of their mint time, so a token minted after this instant survives.
   */
  removeParticipant: (roomId: string, participantId: string, revokeTokensMintedBefore?: Date) => Promise<void>
  getWorldRoomName: (worldName: string) => string
  getWorldSceneRoomName: (worldName: string, sceneId: string) => string
  getSceneRoomName: (realmName: string, sceneId: string) => string
  getPrivateVoiceChatRoomName: (roomId: string) => string
  getCallIdFromRoomName: (roomName: string) => string
  getCommunityVoiceChatRoomName: (communityId: string) => string
  getCommunityIdFromRoomName: (roomName: string) => string
  /** Builds the LiveKit room name for an island. The `island-` prefix is required, not cosmetic. */
  getIslandRoomName: (islandName: string) => string
  getIslandNameFromRoomName: (roomName: string) => string
  getRoomMetadataFromRoomName: (roomName: string) => RoomMetadata
  getRoomName: (realmName: string, params: GetRoomNameParams) => string
  getRoom: (roomName: string) => Promise<Room>
  getRoomInfo: (roomName: string) => Promise<Room | null>
  /**
   * Lists the rooms LiveKit holds, narrowed to `names` when given — LiveKit answers only with
   * the ones that exist, so this doubles as a batch existence check. Rejects rather than
   * answering an empty list when LiveKit cannot be reached.
   */
  listRooms: (names?: string[]) => Promise<Room[]>
  getOrCreateIngress: (roomName: string, participantIdentity: string) => Promise<IngressInfo>
  removeIngress: (ingressId: string) => Promise<IngressInfo | undefined>
  getWebhookEvent: (body: string, authorization: string) => Promise<WebhookEvent>
  getParticipantInfo: (roomId: string, participantId: string) => Promise<ParticipantInfo | null>
  /** Rejects on a failed lookup instead of reporting the identity as absent. */
  listParticipantsHolding: (roomId: string, identity: string) => Promise<ParticipantHold[]>
  listRoomParticipants: (roomName: string) => Promise<ParticipantInfo[]>
  updateParticipantMetadata: (roomId: string, participantId: string, metadata: Record<string, unknown>) => Promise<void>
  updateParticipantPermissions: (
    roomId: string,
    participantId: string,
    permissions: ParticipantPermissions
  ) => Promise<void>
  updateRoomMetadata: (roomId: string, metadata: Record<string, unknown>) => Promise<void>
  appendToRoomMetadataArray: (roomId: string, field: string, value: string) => Promise<void>
  removeFromRoomMetadataArray: (roomId: string, field: string, value: string) => Promise<void>
  removeParticipantFromAllRooms: (participantIdentity: string) => Promise<void>
}
