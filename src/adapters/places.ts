import { AppComponents } from '../types'
import { PlaceNotFoundError } from '../types/errors'
import { IPlacesComponent, PlaceAttributes, PlaceResponse } from '../types/places.type'

export async function createPlacesComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs' | 'fetch' | 'worlds'>
): Promise<IPlacesComponent> {
  const { config, cachedFetch, logs, fetch, worlds } = components

  const logger = logs.getLogger('places-component')

  const placesApiUrl = await config.requireString('PLACES_API_URL')

  const fetchFromCache = cachedFetch.cache<PlaceResponse>()

  async function getPlaceByParcel(parcel: string): Promise<PlaceAttributes> {
    const response = await fetchFromCache.fetch(`${placesApiUrl}/places?positions=${parcel}`)

    if (!response?.data?.length) {
      logger.info(`No place found with parcel ${parcel}`)
      throw new PlaceNotFoundError(`No place found with parcel ${parcel}`)
    }

    return response.data[0]
  }

  /**
   * Gets a world scene place by world name and position.
   * Used for scene-specific operations where we need the place for a specific scene within a world.
   * Queries /places endpoint with positions and names[] parameters.
   */
  async function getWorldScenePlace(worldName: string, position: string): Promise<PlaceAttributes> {
    const lowercasedWorldName = worldName.toLowerCase()
    const response = await fetchFromCache.fetch(
      `${placesApiUrl}/places?positions=${position}&names=${lowercasedWorldName}`
    )

    if (!response?.data?.length) {
      logger.info(`No world scene place found for world ${worldName} at position ${position}`)
      throw new PlaceNotFoundError(`No world scene place found for world ${worldName} at position ${position}`)
    }

    return response.data[0]
  }

  /**
   * @deprecated Use getWorldScenePlace instead. Kept only for backwards compatibility
   * with legacy rooms that lack a sceneId.
   */
  async function getWorldByName(worldName: string): Promise<PlaceAttributes> {
    const worldId = worldName.toLowerCase()
    const response = await fetch.fetch(`${placesApiUrl}/worlds/${worldId}`)

    if (!response.ok) {
      logger.info(`No world found with name ${worldName}`)
      throw new PlaceNotFoundError(`No world found with name ${worldName}`)
    }

    const world = (await response.json()) as { data: PlaceAttributes; ok: boolean }

    if (!world?.data) {
      logger.info(`No world found with name ${worldName}`)
      throw new PlaceNotFoundError(`No world found with name ${worldName}`)
    }

    return world.data
  }

  async function getPlaceStatusByIds(
    ids: string[]
  ): Promise<Pick<PlaceAttributes, 'id' | 'disabled' | 'world' | 'world_name' | 'base_position' | 'positions'>[]> {
    const response = await fetch.fetch(`${placesApiUrl}/places/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ids)
    })

    const places = (await response.json()) as PlaceResponse

    if (!places?.data || places.data.length === 0) {
      logger.info(`No places found with ids ${ids}`)
      throw new PlaceNotFoundError(`No places found with ids ${ids}`)
    }

    return places.data
  }

  /**
   * Gets a world scene place by resolving the entity ID through the worlds content server
   * to obtain the base parcel, then querying the Places API.
   */
  async function getWorldScenePlaceByEntityId(worldName: string, entityId: string): Promise<PlaceAttributes> {
    const metadata = await worlds.fetchWorldSceneEntityMetadataById(entityId)

    if (!metadata?.scene?.base) {
      logger.info(`No scene entity found for entity ID ${entityId} in world ${worldName}`)
      throw new PlaceNotFoundError(`No scene entity found for entity ID ${entityId} in world ${worldName}`)
    }

    return getWorldScenePlace(worldName, metadata.scene.base)
  }

  return {
    getPlaceByParcel,
    getWorldScenePlace,
    getWorldScenePlaceByEntityId,
    getWorldByName,
    getPlaceStatusByIds
  }
}
