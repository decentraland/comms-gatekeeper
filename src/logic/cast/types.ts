export interface ICastComponent {
  generateStreamLink(params: GenerateStreamLinkParams): Promise<GenerateStreamLinkResult>
  validateStreamerToken(streamingKey: string, identity: string): Promise<ValidateStreamerTokenResult>
  generateWatcherCredentials(roomId: string, identity: string): Promise<GenerateWatcherCredentialsResult>
  generateWatcherCredentialsByLocation(
    location: string,
    identity: string,
    parcel?: string
  ): Promise<GenerateWatcherCredentialsResult>
  generatePresentationBotToken(streamingKey: string): Promise<PresentationBotTokenResult>
}

export interface GenerateStreamLinkParams {
  walletAddress: string
  worldName?: string
  parcel: string
  sceneId: string
  realmName: string
  skipAdminCheck?: boolean
}

export interface GenerateStreamLinkResult {
  streamLink: string
  watcherLink: string
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
  placeName?: string
}

export interface PresentationBotTokenResult {
  url: string
  token: string
  roomId: string
}
