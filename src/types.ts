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
import { ICachedFetchComponent } from './types/fetch.type'
import { IPlacesComponent } from './types/places.type'
import { IWorldComponent } from './types/worlds.type'
import { ILandComponent } from './types/lands.type'
import { ISceneManager } from './types/scene-manager.type'
import { INamesComponent } from './types/names.type'
import { ISocialComponent } from './types/social.type'
import { IPlaceChecker, IStreamingChecker, IStreamingKeyChecker } from './types/checker.type'
import { ILivekitComponent } from './types/livekit.type'

export type GlobalContext = {
  components: BaseComponents
}

export type BaseComponents = {
  social: ISocialComponent
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
  worlds: IWorldComponent
  lands: ILandComponent
  names: INamesComponent
  sceneManager: ISceneManager
  placesChecker: IPlaceChecker
  streamingTTLChecker: IStreamingChecker
  streamingKeyTTLChecker: IStreamingKeyChecker
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

export type Permissions = {
  cast: string[]
  mute: string[]
  canPublish?: boolean
  canSubscribe?: boolean
  canUpdateOwnMetadata?: boolean
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

export type RealmAuthMetadata = {
  hostname: string
  protocol: string
  serverName: string
}

export type AuthData = {
  identity: string
  sceneId?: string
  parcel: string
  realm: RealmAuthMetadata
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
  streaming: boolean
  streaming_start_time: number
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
  getPlacesIdWithActiveAdmins(): Promise<string[]>
  removeAllAdminsByPlaceIds(placeIds: string[]): Promise<void>
}

export interface ISceneStreamAccessManager {
  addAccess(input: AddSceneStreamAccessInput): Promise<SceneStreamAccess>
  removeAccess(placeId: string): Promise<void>
  removeAccessByPlaceIds(placeIds: string[]): Promise<void>
  getAccess(placeId: string): Promise<SceneStreamAccess>
  getActiveStreamingKeys(): Promise<SceneStreamAccess[]>
  startStreaming(ingressId: string): Promise<void>
  stopStreaming(ingressId: string): Promise<void>
  isStreaming(ingressId: string): Promise<boolean>
  getActiveStreamings(): Promise<SceneStreamAccess[]>
  killStreaming(ingressId: string): Promise<void>
}
