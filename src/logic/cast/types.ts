export interface ICastComponent {
  generateStreamLink(params: GenerateStreamLinkParams): Promise<GenerateStreamLinkResult>
  validateStreamerToken(streamingKey: string): Promise<ValidateStreamerTokenResult>
  validateWatcherToken(roomId: string, identity: string): Promise<ValidateWatcherTokenResult>
  upgradeParticipantPermissions(params: UpgradePermissionsParams): Promise<void>
}

export interface GenerateStreamLinkParams {
  walletAddress: string
  worldName?: string
  parcel?: string
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

export interface ValidateWatcherTokenResult {
  url: string
  token: string
  roomId: string
  identity: string
}

export interface UpgradePermissionsParams {
  roomId: string
  participantId: string
  walletAddress: string
  signature: string
}
