import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { SceneParcels } from '@dcl/schemas'
import { isPlaceRemoved } from '../logic/utils'
import { AppComponents } from '../types'
import { InvalidRequestError, PlaceNotFoundError, ServiceUnavailableError } from '../types/errors'
import { IPlacesComponent, PlaceAttributes, PlaceResponse } from '../types/places.type'

export async function createPlacesComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'fetch' | 'worlds' | 'contentClient' | 'cachedFetch'>
): Promise<IPlacesComponent> {
  const { config, logs, fetch, worlds, contentClient, cachedFetch } = components

  const logger = logs.getLogger('places-component')

  const placesApiUrl = await config.requireString('PLACES_API_URL')
  const requestTimeout = (await config.getNumber('PLACES_REQUEST_TIMEOUT_MS')) ?? 5000
  const ttl = (await config.getNumber('PLACES_CACHE_TTL_MS')) ?? 10000
  const placesCache = cachedFetch.cache<PlaceResponse>({ ttl, allowStaleOnFetchRejection: false })

  async function fetchPlaces(url: string, options: RequestInit = {}): Promise<PlaceResponse> {
    return placesCache.fetch(JSON.stringify([url, options.method ?? 'GET', options.body ?? null]), {
      context: async () => {
        try {
          const response = await fetch.fetch(url, { ...options, signal: AbortSignal.timeout(requestTimeout) })
          if (!response.ok) {
            await response.body?.cancel().catch(() => undefined)
            if (response.status === 404) throw new PlaceNotFoundError('Place not found')
            throw new ServiceUnavailableError('Place verification is temporarily unavailable')
          }
          return await response.json()
        } catch (error) {
          if (error instanceof PlaceNotFoundError || error instanceof ServiceUnavailableError) throw error
          throw new ServiceUnavailableError('Place verification is temporarily unavailable')
        }
      }
    })
  }

  async function getPlaceByParcel(parcel: string): Promise<PlaceAttributes> {
    if (!parcel) throw new InvalidRequestError('A parcel is required')
    const response = await fetchPlaces(`${placesApiUrl}/places?positions=${encodeURIComponent(parcel)}`)

    const place = response?.data?.find(
      (candidate) => !isPlaceRemoved(candidate) && !candidate.world && candidate.positions.includes(parcel)
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
  async function getWorldScenePlace(worldName: string, position?: string): Promise<PlaceAttributes> {
    if (!position) {
      const sceneId = await worlds.resolveWorldSceneId(worldName, worldName)
      return getWorldScenePlaceByEntityId(worldName, sceneId)
    }
    const lowercasedWorldName = worldName.toLowerCase()
    const response = await fetchPlaces(
      `${placesApiUrl}/places?positions=${encodeURIComponent(position)}&names=${encodeURIComponent(lowercasedWorldName)}&include_opted_out=true`
    )

    const place = response?.data?.find(
      (candidate) =>
        !isPlaceRemoved(candidate) &&
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
  ): Promise<
    Pick<
      PlaceAttributes,
      'id' | 'disabled' | 'disabled_reason' | 'world' | 'world_name' | 'base_position' | 'positions'
    >[]
  > {
    const places = await fetchPlaces(`${placesApiUrl}/places/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([...new Set(ids)].sort())
    })

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
  async function getWorldScenePlaceByEntityId(
    worldName: string,
    entityId: string,
    options?: { allowPreviousDeployment?: boolean }
  ): Promise<PlaceAttributes> {
    const scene = await worlds.fetchWorldSceneByEntityId(worldName, entityId)

    if (!scene?.baseParcel && options?.allowPreviousDeployment) {
      const metadata = await worlds.fetchWorldSceneEntityMetadataById(entityId)
      if (SceneParcels.validate(metadata?.scene)) {
        await worlds.resolveWorldSceneId(worldName, entityId, metadata.scene.base, { allowPreviousDeployment: true })
        return getWorldScenePlace(worldName, metadata.scene.base)
      }
    }
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
  async function getPlaceBySceneId(
    sceneId: string,
    worldName?: string,
    parcel?: string,
    options?: { allowPreviousDeployment?: boolean; allowMissingPlace?: boolean }
  ): Promise<PlaceAttributes> {
    if (worldName) {
      if (!parcel) return getWorldScenePlaceByEntityId(worldName, sceneId, options)
      const scene = await worlds.fetchWorldSceneByPointer(worldName, parcel)
      if (!scene || scene.entityId.toLowerCase() !== sceneId.toLowerCase() || !scene.parcels.includes(parcel)) {
        throw new PlaceNotFoundError(`Scene ${sceneId} is not active at ${parcel} in world ${worldName}`)
      }
      return getWorldScenePlace(worldName, parcel)
    }

    const entity = await contentClient.fetchEntityById(sceneId)
    if (entity?.id !== sceneId) throw new PlaceNotFoundError(`Scene identity does not match ${sceneId}`)
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

    if (!options?.allowPreviousDeployment) {
      const activeEntities = await contentClient.fetchEntitiesByPointers([scene.base], {
        skipCache: true,
        expectedEntityId: sceneId
      })
      if (!activeEntities.some((active) => active.id === sceneId)) {
        throw new PlaceNotFoundError(`Scene ${sceneId} is no longer active at ${scene.base}`)
      }
    }
    try {
      return await getPlaceByParcel(scene.base)
    } catch (error) {
      // Only joins may lack a Places entry, after the entity itself has been verified.
      if (options?.allowMissingPlace && error instanceof PlaceNotFoundError) return undefined
      throw error
    }
  }

  /**
   * Resolves a scene once, returning the exact room identity and its matching place together.
   * @param sceneId - Requested deployment ID or legacy world name.
   * @param worldName - World containing the deployment; omit for Genesis City.
   * @param parcel - Optional parcel that must belong to the requested deployment.
   * @param options - Whether to allow a verified previous deployment for a join.
   * @returns Canonical scene ID for room naming and the place for permission checks.
   * @throws InvalidRequestError, PlaceNotFoundError or ServiceUnavailableError if verification fails.
   */
  async function resolveScenePlace(
    sceneId: string,
    worldName?: string,
    parcel?: string,
    options?: { allowPreviousDeployment?: boolean; allowMissingPlace?: boolean }
  ): Promise<{ sceneId: string; place: PlaceAttributes | undefined }> {
    if (worldName) {
      const scene = await worlds.resolveWorldScene(worldName, sceneId, parcel, options)
      return { sceneId: scene.sceneId, place: await getWorldScenePlace(worldName, scene.parcel) }
    }
    return { sceneId, place: await getPlaceBySceneId(sceneId, undefined, parcel, options) }
  }

  return {
    [STOP_COMPONENT]: async () => {
      placesCache.clear()
    },
    getPlaceByParcel,
    getWorldScenePlace,
    getWorldScenePlaceByEntityId,
    getPlaceBySceneId,
    resolveScenePlace,
    getWorldByName,
    getPlaceStatusByIds
  }
}
