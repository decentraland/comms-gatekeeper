import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent,
  IBaseComponent,
  IMetricsComponent,
  ITracerComponent,
  IFetchComponent
} from '@well-known-components/interfaces'
import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { metricDeclarations } from './metrics'
import { IBlockListComponent } from './adapters/blocklist'
import { IPgComponent } from '@well-known-components/pg-component'
import { Room } from 'livekit-server-sdk'
import { IngressInfo } from 'livekit-server-sdk/dist/proto/livekit_ingress'
import { ICachedFetchComponent } from './types/fetch.type'
import { IPlacesComponent } from './types/places.type'
import { IWorldComponent } from './types/world.type'
import { ILandComponent } from './types/land.type'
import { ISceneManager } from './types/scene-manager.type'

export type GlobalContext = {
  components: BaseComponents
}

export type BaseComponents = {
  config: IConfigComponent
  tracer: ITracerComponent
  blockList: IBlockListComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<GlobalContext>
  fetch: IFetchComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  livekit: ILivekitComponent
  database: IPgComponent
  sceneAdminManager: ISceneAdminManager
  sceneStreamAccessManager: ISceneStreamAccessManager
  cachedFetch: ICachedFetchComponent
  places: IPlacesComponent
  world: IWorldComponent
  land: ILandComponent
  sceneManager: ISceneManager
}

export type AppComponents = BaseComponents & {
  statusChecks: IBaseComponent
}

export type TestComponents = BaseComponents & {
  localFetch: IFetchComponent
}

export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
> &
  DecentralandSignatureContext<any>

export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class StreamingAccessUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class PlaceNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export type Permissions = {
  cast: string[]
  mute: string[]
  canPublish?: boolean
  canSubscribe?: boolean
  canUpdateOwnMetadata?: boolean
}

export type LivekitCredentials = {
  token: string
  url: string
}

export interface Land {
  name: string | null
  contractAddress: string
  tokenId: string
  category: 'estate' | 'parcel'
  description?: string
  price: string | null
  image: string
  x?: string
  y?: string
}

export interface LandsResponse {
  elements: Array<{
    category: string
    x: string
    y: string
    [key: string]: any
  }>
  totalAmount: number
  pageNum: string
  pageSize: string
}

export interface Name {
  name: string
  contractAddress: string
  tokenId: string
  price: string
}

export interface NamesResponse {
  elements: Array<{
    name: string
    [key: string]: any
  }>
  totalAmount: number
  pageNum: string
  pageSize: string
}

export type AddressResource = 'lands' | 'names'
export type AddressResourceResponse<T extends AddressResource> = T extends 'lands' ? LandsResponse : NamesResponse

export type AuthData = {
  identity: string
  realmName: string
  sceneId?: string
  parcel: string
  hostname: string
}

export type SceneAdmin = {
  id: string
  place_id: string
  admin: string
  added_by: string
  created_at: number
  active: boolean
}

export type SceneStreamAccess = {
  id: string
  place_id: string
  streaming_key: string
  streaming_url: string
  ingress_id: string
  created_at: number
  active: boolean
}

export interface AddSceneAdminInput {
  place_id: string
  admin: string
  added_by: string
}

export interface AddSceneStreamAccessInput {
  place_id: string
  streaming_url: string
  streaming_key: string
  ingress_id: string
}

export type ListSceneAdminFilters = {
  place_id: string
  admin?: string
}

export interface ISceneAdminManager {
  addAdmin(input: AddSceneAdminInput): Promise<void>
  removeAdmin(placeId: string, adminAddress: string): Promise<void>
  listActiveAdmins(filters: ListSceneAdminFilters): Promise<SceneAdmin[]>
  isAdmin(placeId: string, address: string): Promise<boolean>
}

export interface ISceneStreamAccessManager {
  addAccess(input: AddSceneStreamAccessInput): Promise<SceneStreamAccess>
  removeAccess(placeId: string, adminAddress: string): Promise<void>
  getAccess(placeId: string): Promise<SceneStreamAccess>
}

export class DuplicateAdminError extends Error {
  constructor() {
    super('Admin already exists for this place')
  }
}

export type LivekitSettings = {
  host: string
  apiKey: string
  secret: string
}

export type ILivekitComponent = IBaseComponent & {
  generateCredentials: (
    identity: string,
    roomId: string,
    permissions: Omit<Permissions, 'mute'>,
    forPreview: boolean
  ) => Promise<LivekitCredentials>
  muteParticipant: (roomId: string, participantId: string) => Promise<void>
  getWorldRoomName: (worldName: string) => string
  getSceneRoomName: (realmName: string, sceneId: string) => string
  getRoom: (roomName: string) => Promise<Room>
  getOrCreateIngress: (roomName: string, participantIdentity: string) => Promise<IngressInfo>
  removeIngress: (ingressId: string) => Promise<IngressInfo>
}

export enum PermissionType {
  Unrestricted = 'unrestricted',
  SharedSecret = 'shared-secret',
  NFTOwnership = 'nft-ownership',
  AllowList = 'allow-list'
}

export type UnrestrictedPermissionSetting = {
  type: PermissionType.Unrestricted
}

export type SharedSecretPermissionSetting = {
  type: PermissionType.SharedSecret
  secret: string
}

export type NftOwnershipPermissionSetting = {
  type: PermissionType.NFTOwnership
  nft: string
}

export type AllowListPermissionSetting = {
  type: PermissionType.AllowList
  wallets: string[]
}

export type AccessPermissionSetting =
  | UnrestrictedPermissionSetting
  | SharedSecretPermissionSetting
  | NftOwnershipPermissionSetting
  | AllowListPermissionSetting

export type PermissionsOverWorld = {
  deployment: AllowListPermissionSetting
  access: AccessPermissionSetting
  streaming: UnrestrictedPermissionSetting | AllowListPermissionSetting
}
