export interface ICastComponent {
  generateStreamLink(params: GenerateStreamLinkParams): Promise<GenerateStreamLinkResult>
  validateStreamerToken(streamingKey: string): Promise<ValidateStreamerTokenResult>
  validateWatcherToken(roomId: string, identity: string): Promise<ValidateWatcherTokenResult>
}

export interface GenerateStreamLinkParams {
  walletAddress: string
  worldName?: string
  parcel?: string
  sceneId: string
  realmName: string
}

export interface GenerateStreamLinkResult {
  streamLink: string
  streamingKey: string
  placeId: string
  placeName: string
  expiresAt: string
  expiresInDays: number
}

export interface ValidateStreamerTokenResult {
  url: string
  token: string
  roomId: string
  identity: string
  sceneRoom?: {
    url: string
    token: string
    roomId: string
  }
}

export interface ValidateWatcherTokenResult {
  url: string
  token: string
  roomId: string
  identity: string
  roomName?: string
  sceneRoom?: {
    url: string
    token: string
    roomId: string
  }
}
