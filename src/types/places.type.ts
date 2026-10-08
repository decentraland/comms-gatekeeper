import { IBaseComponent } from '@well-known-components/interfaces'

export type IPlacesComponent = IBaseComponent & {
  /** Verifies the scene once. Only Genesis joins may allow a missing place after entity verification. */
  resolveScenePlace(
    sceneId: string,
    worldName?: string,
    parcel?: string,
    options?: { allowPreviousDeployment?: boolean; allowMissingPlace?: boolean }
  ): Promise<{ sceneId: string; place: PlaceAttributes | undefined }>
  getPlaceByParcel(parcel: string): Promise<PlaceAttributes>
  /**
   * Gets a world scene place by world name and position.
   * Used for scene-specific operations where we need the place for a specific scene within a world.
   * Queries /places endpoint with positions and names[] parameters.
   * @param worldName - The world name (e.g., "myworld.dcl.eth")
   * @param position - The parcel position (omit only for a single-scene world) (e.g., "10,20")
   */
  getWorldScenePlace(worldName: string, position?: string): Promise<PlaceAttributes>
  /**
   * Gets a world scene place by resolving the entity ID through the worlds content server,
   * then querying the Places API with the resulting base parcel.
   * @param worldName - The world name (e.g., "myworld.dcl.eth")
   * @param entityId - The scene entity ID from the worlds content server
   */
  getWorldScenePlaceByEntityId(
    worldName: string,
    entityId: string,
    options?: { allowPreviousDeployment?: boolean }
  ): Promise<PlaceAttributes>
  /**
   * Resolves the place that owns the scene identified by `sceneId`. This is the counterpart to
   * LiveKit room naming (also keyed by `sceneId`), so admin/ban checks resolve the same place the
   * room belongs to. For world scenes the world content server maps the entity to its base parcel;
   * for Genesis City scenes the catalyst content entity's base parcel is resolved, then the Places
   * API returns the place there.
   * @param sceneId - The scene entity id (authoritative — the room is keyed by it).
   * @param worldName - The world name for world scenes; omit for Genesis City scenes.
   * @param parcel - Optional signed parcel, which must belong to the deployment.
   * @throws {PlaceNotFoundError} If the scene entity or its base parcel cannot be resolved.
   */
  getPlaceBySceneId(
    sceneId: string,
    worldName?: string,
    parcel?: string,
    options?: { allowPreviousDeployment?: boolean; allowMissingPlace?: boolean }
  ): Promise<PlaceAttributes | undefined>
  /**
   * @deprecated Use getWorldScenePlace instead. Kept only for backwards compatibility
   * with legacy rooms that lack a sceneId.
   * Gets a world by its name.
   * Queries /worlds/:world-id endpoint where world-id is the lowercased world name.
   * @param worldName - The world name (e.g., "myworld.dcl.eth")
   */
  getWorldByName(worldName: string): Promise<PlaceAttributes>
  getPlaceStatusByIds(
    ids: string[]
  ): Promise<
    Pick<
      PlaceAttributes,
      'id' | 'disabled' | 'disabled_reason' | 'world' | 'world_name' | 'base_position' | 'positions'
    >[]
  >
}

export type PlaceDisabledReason = 'opt_out' | 'undeployment' | 'overwritten' | 'moderation'

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
  /** `opt_out` means the world owner chose not to be listed; the scene is still live. */
  disabled_reason?: PlaceDisabledReason | null
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

export type PlaceResponse = {
  data: PlaceAttributes[]
  ok: boolean
  total: number
}
