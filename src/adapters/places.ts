import { SceneParcels } from '@dcl/schemas'
import { AppComponents } from '../types'
import { PlaceNotFoundError } from '../types/errors'
import { IPlacesComponent, PlaceAttributes, PlaceResponse } from '../types/places.type'

export async function createPlacesComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs' | 'fetch' | 'worlds' | 'contentClient'>
): Promise<IPlacesComponent> {
  const { config, cachedFetch, logs, fetch, worlds, contentClient } = components

  const logger = logs.getLogger('places-component')

  const placesApiUrl = await config.requireString('PLACES_API_URL')

  const fetchFromCache = cachedFetch.cache<PlaceResponse>()

  async function getPlaceByParcel(parcel: string): Promise<PlaceAttributes> {
    const response = await fetchFromCache.fetch(`${placesApiUrl}/places?positions=${encodeURIComponent(parcel)}`)

    const place = response?.data?.find(
      (candidate) => !candidate.disabled && !candidate.world && candidate.positions.includes(parcel)
    )
    if (!place) {
      logger.info(`No place found with parcel ${parcel}`)
      throw new PlaceNotFoundError(`No place found with parcel ${parcel}`)
    }

    return place
  }

  /**
   * Gets a world scene place by world name and position.
   * Used for scene-specific operations where we need the place for a specific scene within a world.
   * Queries /places endpoint with positions and names[] parameters.
   */
  async function getWorldScenePlace(worldName: string, position: string): Promise<PlaceAttributes> {
    const lowercasedWorldName = worldName.toLowerCase()
    const response = await fetchFromCache.fetch(
      `${placesApiUrl}/places?positions=${encodeURIComponent(position)}&names=${encodeURIComponent(lowercasedWorldName)}`
    )

    const place = response?.data?.find(
      (candidate) =>
        !candidate.disabled &&
        candidate.world &&
        candidate.world_name?.toLowerCase() === lowercasedWorldName &&
        candidate.positions.includes(position)
    )
    if (!place) {
      logger.info(`No world scene place found for world ${worldName} at position ${position}`)
      throw new PlaceNotFoundError(`No world scene place found for world ${worldName} at position ${position}`)
    }

    return place
  }

  /**
   * @deprecated Use getWorldScenePlace instead. Kept only for backwards compatibility
   * with legacy rooms that lack a sceneId.
   */
  async function getWorldByName(worldName: string): Promise<PlaceAttributes> {
    const worldId = worldName.toLowerCase()
    const response = await fetch.fetch(`${placesApiUrl}/worlds/${encodeURIComponent(worldId)}`)

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
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
    const scene = await worlds.fetchWorldSceneByEntityId(worldName, entityId)
    if (!scene?.baseParcel) {
      logger.info(`No scene entity found for entity ID ${entityId} in world ${worldName}`)
      throw new PlaceNotFoundError(`No scene entity found for entity ID ${entityId} in world ${worldName}`)
    }
    return getWorldScenePlace(worldName, scene.baseParcel)
  }

  /**
   * Resolves the place that owns the scene identified by `sceneId`, using the SAME scene identity
   * the LiveKit room name is derived from. Resolving from a separately-supplied parcel would let a
   * caller prove rights over one place while acting on a different scene's room. World scenes and
   * Genesis City scenes live on different content servers, so each uses its own entity lookup.
   */
  async function getPlaceBySceneId(sceneId: string, worldName?: string, parcel?: string): Promise<PlaceAttributes> {
    if (worldName) {
      if (!parcel) return getWorldScenePlaceByEntityId(worldName, sceneId)
      const scene = await worlds.fetchWorldSceneByPointer(worldName, parcel)
      if (!scene || scene.entityId !== sceneId || !scene.parcels.includes(parcel)) {
        throw new PlaceNotFoundError(`Scene ${sceneId} is not active at ${parcel} in world ${worldName}`)
      }
      return getWorldScenePlace(worldName, parcel)
    }

    const entity = await contentClient.fetchEntityById(sceneId)
    const scene = entity?.metadata?.scene
    const pointers = entity?.pointers
    const validPointers =
      Array.isArray(pointers) &&
      pointers.length > 0 &&
      pointers.every((pointer) => typeof pointer === 'string') &&
      SceneParcels.validate({ base: pointers[0], parcels: pointers })
    const pointerSet = validPointers ? new Set(pointers) : new Set<string>()
    const validIdentity =
      SceneParcels.validate(scene) &&
      pointerSet.size === scene.parcels.length &&
      scene.parcels.every((value) => pointerSet.has(value)) &&
      (!parcel || scene.parcels.includes(parcel))
    if (!validIdentity) {
      logger.info(`No scene entity found for scene ID ${sceneId}`)
      throw new PlaceNotFoundError(`No scene entity found for scene ID ${sceneId}`)
    }

    return getPlaceByParcel(scene.base)
  }

  return {
    getPlaceByParcel,
    getWorldScenePlace,
    getWorldScenePlaceByEntityId,
    getPlaceBySceneId,
    getWorldByName,
    getPlaceStatusByIds
  }
}
