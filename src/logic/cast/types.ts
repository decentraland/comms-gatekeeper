export interface ICastComponent {
  /**
   * Adds a participant to the presenters list in room metadata.
   * Idempotent — calling twice with the same identity has no additional effect.
   *
   * @param roomId - LiveKit room identifier
   * @param identity - Ethereum address of the participant to add
   */
  addPresenter(roomId: string, identity: string): Promise<void>

  /**
   * Generates a stream link for a scene. Requires admin permissions.
   * @param params - Stream link generation parameters
   * @returns Stream link details including streaming key and expiration
   * @throws {NotSceneAdminError} If the caller is not a scene admin
   */
  generateStreamLink(params: GenerateStreamLinkParams): Promise<GenerateStreamLinkResult>

  /**
   * Generates a stream link for local preview. Skips admin check and uses a synthetic place.
   * @param params - Preview parameters including sceneId, realmName, and walletAddress
   * @returns Stream link details including streaming key and expiration
   */
  generatePreviewStreamLink(params: {
    sceneId: string
    realmName: string
    walletAddress: string
  }): Promise<GenerateStreamLinkResult>

  /**
   * Validates a streamer's streaming key and generates LiveKit credentials.
   * @param streamingKey - The streaming key to validate
   * @param identity - Display name for the streamer
   * @returns LiveKit credentials and room information
   * @throws {InvalidStreamingKeyError} If the streaming key is not found
   * @throws {ExpiredStreamingKeyError} If the streaming key has expired
   */
  validateStreamerToken(streamingKey: string, identity: string): Promise<ValidateStreamerTokenResult>

  /**
   * Generates watcher credentials for a specific room.
   * @param roomId - The LiveKit room ID to join
   * @param identity - Display name for the watcher
   * @returns LiveKit credentials for the watcher
   */
  generateWatcherCredentials(roomId: string, identity: string): Promise<GenerateWatcherCredentialsResult>

  /**
   * Generates watcher credentials by resolving a location to a room.
   * @param location - Parcel coordinates or world name
   * @param identity - Display name for the watcher
   * @param parcel - Optional parcel to resolve a specific scene within a world
   * @returns LiveKit credentials with place name
   * @throws {NoActiveStreamError} If no active stream exists for the location
   * @throws {ExpiredStreamAccessError} If the stream access has expired
   */
  generateWatcherCredentialsByLocation(
    location: string,
    identity: string,
    parcel?: string
  ): Promise<GenerateWatcherCredentialsResult>

  /**
   * Generates a LiveKit token for a presentation bot to join a cast room.
   * @param streamingKey - The streaming key used by the streamer
   * @returns LiveKit connection details for the presentation bot
   * @throws {InvalidStreamingKeyError} If the streaming key is not found
   * @throws {ExpiredStreamingKeyError} If the streaming key has expired
   */
  generatePresentationBotToken(streamingKey: string): Promise<PresentationBotTokenResult>

  /**
   * Promotes a participant to the presenter role within a cast room.
   * @param roomId - LiveKit room identifier
   * @param participantIdentity - Ethereum address of the participant to promote
   * @param callerAddress - Ethereum address of the caller (must be scene admin)
   * @throws {NoActiveStreamError} If the room has no active stream
   * @throws {NotSceneAdminError} If the caller is not a scene admin
   */
  promotePresenter(roomId: string, participantIdentity: string, callerAddress: string): Promise<void>

  /**
   * Demotes a presenter back to watcher role within a cast room.
   * @param roomId - LiveKit room identifier
   * @param participantIdentity - Ethereum address of the participant to demote
   * @param callerAddress - Ethereum address of the caller (must be scene admin)
   * @throws {NoActiveStreamError} If the room has no active stream
   * @throws {NotSceneAdminError} If the caller is not a scene admin
   */
  demotePresenter(roomId: string, participantIdentity: string, callerAddress: string): Promise<void>

  /**
   * Returns the list of participants with the presenter role in a cast room.
   * @param roomId - LiveKit room identifier
   * @param callerAddress - Ethereum address of the caller (must be scene admin)
   * @returns Object containing an array of presenter identities
   * @throws {NoActiveStreamError} If the room has no active stream
   * @throws {NotSceneAdminError} If the caller is not a scene admin
   */
  getPresenters(roomId: string, callerAddress: string): Promise<GetPresentersResult>
}

export interface GenerateStreamLinkParams {
  walletAddress: string
  worldName?: string
  parcel: string
  sceneId: string
  realmName: string
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
