import { IBaseComponent } from '@well-known-components/interfaces'

export type IPlacesComponent = IBaseComponent & {
  getPlaceByParcel(parcel: string): Promise<PlaceAttributes>
  getWorldByName(worldName: string): Promise<PlaceAttributes>
  getPlace(isWorlds: boolean, realmName: string, parcel: string): Promise<PlaceAttributes>
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
