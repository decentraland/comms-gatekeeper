export interface ICastComponent {
  generateStreamLink(params: GenerateStreamLinkParams): Promise<GenerateStreamLinkResult>
  validateStreamerToken(streamingKey: string, identity: string): Promise<ValidateStreamerTokenResult>
  generateWatcherCredentials(roomId: string, identity: string): Promise<GenerateWatcherCredentialsResult>
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
}

export interface GenerateWatcherCredentialsResult {
  url: string
  token: string
  roomId: string
  identity: string
}
