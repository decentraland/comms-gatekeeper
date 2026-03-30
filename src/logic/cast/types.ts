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
  promotePresenter(roomId: string, participantIdentity: string, callerAddress: string): Promise<void>
  demotePresenter(roomId: string, participantIdentity: string, callerAddress: string): Promise<void>
  getPresenters(roomId: string, callerAddress: string): Promise<GetPresentersResult>
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

export interface GetPresentersResult {
  presenters: string[]
}
