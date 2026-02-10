import { IBaseComponent } from '@well-known-components/interfaces'

export type IPlacesComponent = IBaseComponent & {
  getPlaceByParcel(parcel: string): Promise<PlaceAttributes>
  /**
   * Gets a world scene place by world name and position.
   * Used for scene-specific operations where we need the place for a specific scene within a world.
   * Queries /places endpoint with positions and names[] parameters.
   * @param worldName - The world name (e.g., "myworld.dcl.eth")
   * @param position - The parcel position (e.g., "10,20")
   */
  getWorldScenePlace(worldName: string, position: string): Promise<PlaceAttributes>
  /**
   * Gets a world by its name.
   * Used for world-wide operations like bans where we need the world itself, not a specific scene.
   * Queries /worlds/:world-id endpoint where world-id is the lowercased world name.
   * @param worldName - The world name (e.g., "myworld.dcl.eth")
   */
  getWorldByName(worldName: string): Promise<PlaceAttributes>
  getPlaceStatusByIds(
    ids: string[]
  ): Promise<Pick<PlaceAttributes, 'id' | 'disabled' | 'world' | 'world_name' | 'base_position'>[]>
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

export type PlaceResponse = {
  data: PlaceAttributes[]
  ok: boolean
  total: number
}
