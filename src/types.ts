import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent,
  IBaseComponent,
  IMetricsComponent,
  IFetchComponent
} from '@well-known-components/interfaces'
import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { metricDeclarations } from './metrics'
import { ISceneFetcherComponent } from './adapters/scene-fetcher'
import { ILivekitComponent } from './adapters/livekit'
import { ISceneAdminManager } from './adapters/scene-admin-manager'
import { IPgComponent } from '@well-known-components/pg-component'

export type GlobalContext = {
  components: BaseComponents
}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<GlobalContext>
  fetch: IFetchComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  sceneFetcher: ISceneFetcherComponent
  livekit: ILivekitComponent
  pg: IPgComponent
  sceneAdminManager: ISceneAdminManager
}

// components used in runtime
export type AppComponents = BaseComponents & {
  statusChecks: IBaseComponent
}

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
}

// this type simplifies the typings of http handlers
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

export type Permissions = {
  cast: string[]
  mute: string[]
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

export type PlaceAttributes = {
  id: string
  title: string | null
  description: string | null
  image: string | null
  highlighted_image: string | null
  owner: string | null
  positions: string[]
  base_position: string
  contact_name: string | null
  contact_email: string | null
  likes: number
  dislikes: number
  favorites: number
  like_rate: number | null
  like_score: number | null
  highlighted: boolean
  disabled: boolean
  disabled_at: Date | null
  created_at: Date
  updated_at: Date
  world: boolean
  world_name: string | null
  deployed_at: Date
  categories: string[]
  user_like: boolean
  user_dislike: boolean
  user_favorite: boolean
  user_count?: number
  user_visits?: number
}
