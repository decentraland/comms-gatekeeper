import { ScenePermissionOptions } from '../types/scene-manager.type'
import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { LRUCache } from 'lru-cache'
import { SceneParcels } from '@dcl/schemas'
import { AppComponents, NamesResponse } from '../types'
import { ensureSlashAtTheEnd } from '../logic/utils'
import {
  IWorldComponent,
  PermissionsOverWorld,
  PermissionType,
  WorldScene,
  ResolvedWorldScene,
  WorldSceneEntityMetadata
} from '../types/worlds.type'
import { getErrorMessage } from '../logic/errors'
import { InvalidRequestError, ServiceUnavailableError } from '../types/errors'

export async function createWorldsComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'fetch' | 'logs'>
): Promise<IWorldComponent> {
  const { config, cachedFetch, fetch, logs } = components
  const logger = logs.getLogger('world-component')

  const [worldContentUrl, lambdasUrl] = await Promise.all([
    config.requireString('WORLD_CONTENT_URL'),
    config.requireString('LAMBDAS_URL')
  ])

  const sceneEntityMetadataCache = new LRUCache<string, WorldSceneEntityMetadata>({ max: 1000, ttl: 300000 })
  const requestTimeout = (await config.getNumber('WORLD_SCENE_REQUEST_TIMEOUT_MS')) ?? 5000
  const sceneCacheTtl = (await config.getNumber('WORLD_SCENE_CACHE_TTL_MS')) ?? 5000
  const parcelPermissionsCacheTtl = (await config.getNumber('WORLD_PARCEL_PERMISSIONS_CACHE_TTL_MS')) ?? 10000
  const permissionsCache = cachedFetch.cache<PermissionsOverWorld>({
    ttl: parcelPermissionsCacheTtl,
    allowStaleOnFetchRejection: false
  })
  const scenesCache = cachedFetch.cache<WorldScene>({ ttl: sceneCacheTtl, allowStaleOnFetchRejection: false })
  const aboutCache = cachedFetch.cache<{ configurations?: { scenesUrn?: string[] } }>({
    ttl: sceneCacheTtl,
    allowStaleOnFetchRejection: false
  })
  const parcelPermissionsCache = cachedFetch.cache<string[]>({
    ttl: parcelPermissionsCacheTtl,
    allowStaleOnFetchRejection: false
  })
  const permissionAddressesCache = cachedFetch.cache<string[]>({
    ttl: parcelPermissionsCacheTtl,
    allowStaleOnFetchRejection: false
  })

  async function fetchWorldJson<T>(url: string, options: RequestInit = {}): Promise<T | undefined> {
    try {
      const response = await fetch.fetch(url, { ...options, signal: AbortSignal.timeout(requestTimeout) })
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        if (response.status === 404) return undefined
        if (response.status === 400) throw new InvalidRequestError('Invalid world scene request')
        throw new ServiceUnavailableError('World scene verification is temporarily unavailable')
      }
      return await response.json()
    } catch (error) {
      if (error instanceof InvalidRequestError || error instanceof ServiceUnavailableError) throw error
      logger.warn('World scene lookup failed', { url, error: getErrorMessage(error) })
      throw new ServiceUnavailableError('World scene verification is temporarily unavailable')
    }
  }
  const namesCache = cachedFetch.cache<NamesResponse>()
  const shortNamesCache = cachedFetch.cache<NamesResponse>({ ttl: 10000 })

  async function fetchWorldActionPermissions(
    worldName: string,
    options?: ScenePermissionOptions
  ): Promise<PermissionsOverWorld | undefined> {
    const response = await permissionsCache.fetch(
      `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/permissions`,
      { forceRefresh: options?.skipCache }
    )
    return response
  }

  async function fetchWorldSceneByPointer(worldName: string, pointer: string): Promise<WorldScene | undefined> {
    return scenesCache.fetch(JSON.stringify(['pointer', worldName.toLowerCase(), pointer]), {
      context: async () => {
        const result = await fetchWorldJson<{ scenes: WorldScene[] }>(
          `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/scenes`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates: [pointer] })
          }
        )
        return result?.scenes?.find((scene) => scene.parcels?.includes(pointer))
      }
    })
  }

  async function fetchWorldSceneEntityMetadataById(entityId: string): Promise<WorldSceneEntityMetadata | undefined> {
    const cached = sceneEntityMetadataCache.get(entityId)
    if (cached) return cached
    const entity = await fetchWorldJson<{ metadata?: WorldSceneEntityMetadata }>(
      `${worldContentUrl}/contents/${encodeURIComponent(entityId)}`
    )
    // Content-addressed metadata is immutable; only successful metadata responses are cached here.
    if (entity?.metadata?.scene) sceneEntityMetadataCache.set(entityId, entity.metadata)
    return entity?.metadata?.scene ? entity.metadata : undefined
  }

  /**
   * Queries the exact active deployment in a world, without scanning its scene list.
   * @param worldName - World that must contain the deployment.
   * @param entityId - Requested deployment ID.
   * @returns The active scene, or undefined for a confirmed miss.
   * @throws ServiceUnavailableError when the upstream cannot verify membership.
   */
  async function fetchWorldSceneByEntityId(worldName: string, entityId: string): Promise<WorldScene | undefined> {
    return scenesCache.fetch(JSON.stringify(['entity', worldName.toLowerCase(), entityId.toLowerCase()]), {
      context: async () => {
        const result = await fetchWorldJson<{ scenes: WorldScene[] }>(
          `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/scenes?entity_id=${encodeURIComponent(entityId.toLowerCase())}&limit=1`
        )
        const scene = result?.scenes?.find((candidate) => candidate.entityId.toLowerCase() === entityId.toLowerCase())
        if (!scene) return undefined
        const baseParcel = scene.baseParcel ?? scene.parcels?.[0]
        if (!SceneParcels.validate({ base: baseParcel, parcels: scene.parcels })) {
          throw new ServiceUnavailableError('World scene index returned invalid parcel metadata')
        }
        return { ...scene, baseParcel }
      }
    })
  }

  async function hasWorldOwnerPermission(
    authAddress: string,
    worldName: string,
    options?: ScenePermissionOptions
  ): Promise<boolean> {
    let nameToValidate = worldName.toLowerCase()

    if (nameToValidate.endsWith('.dcl.eth')) {
      nameToValidate = nameToValidate.slice(0, -8)
    } else if (nameToValidate.endsWith('.eth')) {
      nameToValidate = nameToValidate.slice(0, -4)
    } else {
      logger.info(`Invalid world name: ${worldName}, should end with .dcl.eth or .eth`)
      throw new InvalidRequestError(`Invalid world name: ${worldName}, should end with .dcl.eth or .eth`)
    }

    const baseUrl = ensureSlashAtTheEnd(lambdasUrl)
    if (!baseUrl) {
      throw new Error('Lambdas URL is not set')
    }

    const namesResponse = await (options?.shortCache ? shortNamesCache : namesCache).fetch(
      `${baseUrl}users/${encodeURIComponent(authAddress.toLowerCase())}/names`,
      { forceRefresh: options?.skipCache }
    )

    if (!namesResponse?.elements?.length) return false

    return namesResponse.elements.some((element) => element.name.toLowerCase() === nameToValidate)
  }

  async function hasWorldStreamingPermission(
    authAddress: string,
    worldName: string,
    options?: ScenePermissionOptions
  ): Promise<boolean> {
    const permissionsOverWorld = await fetchWorldActionPermissions(worldName, options)
    const lowerAuthAddress = authAddress.toLowerCase()

    return (
      permissionsOverWorld?.permissions?.streaming.type === PermissionType.AllowList &&
      permissionsOverWorld.permissions.streaming.wallets.some((wallet) => wallet.toLowerCase() === lowerAuthAddress)
    )
  }

  async function hasWorldDeployPermission(
    authAddress: string,
    worldName: string,
    options?: ScenePermissionOptions
  ): Promise<boolean> {
    const permissionsOverWorld = await fetchWorldActionPermissions(worldName, options)
    const lowerAuthAddress = authAddress.toLowerCase()

    return (
      permissionsOverWorld?.permissions?.deployment.type === PermissionType.AllowList &&
      permissionsOverWorld.permissions.deployment.wallets.some((wallet) => wallet.toLowerCase() === lowerAuthAddress)
    )
  }

  async function getWorldParcelPermissions(
    address: string,
    worldName: string,
    permissionName: string,
    options?: ScenePermissionOptions
  ): Promise<string[] | undefined> {
    return parcelPermissionsCache.fetch(
      JSON.stringify([worldName.toLowerCase(), address.toLowerCase(), permissionName]),
      {
        forceRefresh: options?.skipCache,
        context: async () => {
          const url = `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/permissions/${encodeURIComponent(permissionName)}/address/${encodeURIComponent(address.toLowerCase())}/parcels`
          const response = await fetch.fetch(url)
          if (!response.ok) {
            await response.body?.cancel().catch(() => undefined)
            if (response.status === 404) {
              return undefined
            }
            throw new Error(`Error getting ${url}, status: ${response.status}`)
          }
          const result = (await response.json()) as { total: number; parcels: string[] }
          return result?.parcels ?? []
        }
      }
    )
  }

  /**
   * Fetches all addresses that have the given permission over the specified parcels in a world.
   * Uses `POST /world/:world_name/permissions/:permission_name/parcels` with `{ parcels }`.
   */
  async function getWorldParcelPermissionAddresses(
    worldName: string,
    permissionName: string,
    parcels: string[]
  ): Promise<string[]> {
    return permissionAddressesCache.fetch(
      JSON.stringify([worldName.toLowerCase(), permissionName, [...new Set(parcels)].sort()]),
      {
        context: async () => {
          if (parcels.length === 0) {
            return []
          }

          const url = `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/permissions/${encodeURIComponent(permissionName)}/parcels`
          const response = await fetch.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parcels })
          })

          if (!response.ok) {
            await response.body?.cancel().catch(() => undefined)
            throw new Error(`Failed to fetch parcel permission addresses: HTTP ${response.status}`)
          }

          const result = (await response.json()) as { total: number; addresses: string[] }
          return result.addresses ?? []
        }
      }
    )
  }

  /**
   * Fetches the scene entity ID for a world from its about endpoint.
   * Parses the first entry in configurations.scenesUrn to extract the content hash.
   * @throws InvalidRequestError if the request fails, no scenes exist, or the URN format is invalid.
   */
  async function fetchWorldSceneId(worldName: string): Promise<string> {
    const url = `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/about`
    const about = await aboutCache.fetch(url, {
      context: () => fetchWorldJson<{ configurations?: { scenesUrn?: string[] } }>(url)
    })

    const scenesUrn = about?.configurations?.scenesUrn
    if (!scenesUrn || scenesUrn.length === 0) {
      throw new InvalidRequestError(`No scenes found for world ${worldName}`)
    }

    if (scenesUrn.length !== 1) {
      throw new InvalidRequestError(`A parcel is required to resolve a scene in multi-scene world ${worldName}`)
    }
    const urnMatch = scenesUrn[0].match(/^urn:decentraland:entity:([^?]+)/)
    if (!urnMatch) {
      throw new InvalidRequestError(`Invalid scene URN format for world ${worldName}: ${scenesUrn[0]}`)
    }

    return urnMatch[1]
  }

  async function hasWorldAccessPermission(authAddress: string, worldName: string): Promise<boolean> {
    const permissionsOverWorld = await fetchWorldActionPermissions(worldName)
    const { permissions, owner } = permissionsOverWorld ?? {}

    return (
      owner?.toLowerCase() === authAddress.toLowerCase() ||
      permissions?.access.type === PermissionType.Unrestricted ||
      (permissions?.access.type === PermissionType.AllowList &&
        permissions.access.wallets.some((wallet) => wallet.toLowerCase() === authAddress.toLowerCase()))
    )
  }

  /**
   * Resolves legacy world-name scene IDs and canonicalizes world content IDs before authorization.
   * @param worldName - World whose scene is requested.
   * @param sceneId - Content ID or legacy world name.
   * @param parcel - Requested parcel, required to disambiguate multi-scene worlds.
   * @param options - Joins may use old metadata to locate the current deployment with the same world and footprint.
   * @returns The canonical scene ID and verified parcel, reusable for place authorization without another scene lookup.
   * @throws InvalidRequestError when the scene does not belong to the requested world or parcel.
   * @throws ServiceUnavailableError when the upstream cannot verify the scene.
   */
  async function resolveWorldScene(
    worldName: string,
    sceneId: string,
    parcel?: string,
    options?: { allowPreviousDeployment?: boolean }
  ): Promise<ResolvedWorldScene> {
    const isLegacyName = sceneId.toLowerCase().endsWith('.eth')
    try {
      if (parcel) {
        const scene = await fetchWorldSceneByPointer(worldName, parcel)
        if (!scene) throw new InvalidRequestError(`No active scene at ${parcel} in world ${worldName}`)
        if (!isLegacyName && scene.entityId.toLowerCase() !== sceneId.toLowerCase()) {
          if (options?.allowPreviousDeployment) {
            const metadata = await fetchWorldSceneEntityMetadataById(sceneId.toLowerCase())
            const declaredWorld = metadata?.worldConfiguration?.name ?? metadata?.worldConfiguration?.dclName
            if (
              declaredWorld?.toLowerCase() === worldName.toLowerCase() &&
              SceneParcels.validate(metadata?.scene) &&
              metadata.scene.parcels.includes(parcel) &&
              metadata.scene.parcels.length === scene.parcels.length &&
              metadata.scene.parcels.every((value) => scene.parcels.includes(value))
            ) {
              // Metadata is only a location hint, never proof that the requested old ID was deployed.
              return { sceneId: scene.entityId.toLowerCase(), parcel }
            }
          }
          throw new InvalidRequestError(`Scene ${sceneId} is not active at ${parcel} in world ${worldName}`)
        }
        return { sceneId: scene.entityId.toLowerCase(), parcel }
      }
      if (!isLegacyName && options?.allowPreviousDeployment) {
        const active = await fetchWorldSceneByEntityId(worldName, sceneId)
        if (active?.baseParcel) return { sceneId: active.entityId.toLowerCase(), parcel: active.baseParcel }
        const metadata = await fetchWorldSceneEntityMetadataById(sceneId.toLowerCase())
        if (SceneParcels.validate(metadata?.scene)) {
          return resolveWorldScene(worldName, sceneId, metadata.scene.base, options)
        }
        throw new InvalidRequestError(`Scene ${sceneId} cannot be resolved in world ${worldName}`)
      }
      const entityId = isLegacyName ? await fetchWorldSceneId(worldName) : sceneId
      const scene = await fetchWorldSceneByEntityId(worldName, entityId)
      if (!scene?.baseParcel) throw new InvalidRequestError(`Scene ${sceneId} is not active in world ${worldName}`)
      return { sceneId: scene.entityId.toLowerCase(), parcel: scene.baseParcel }
    } catch (error) {
      logger.warn('Failed to resolve world scene', {
        worldName,
        sceneId,
        parcel: parcel || '',
        error: getErrorMessage(error)
      })
      if (error instanceof InvalidRequestError) throw error
      if (error instanceof ServiceUnavailableError) throw error
      throw new ServiceUnavailableError(`Scene verification is temporarily unavailable for world ${worldName}`)
    }
  }

  /** Resolves only the ID for operations that do not need a place. */
  async function resolveWorldSceneId(
    worldName: string,
    sceneId: string,
    parcel?: string,
    options?: { allowPreviousDeployment?: boolean }
  ): Promise<string> {
    if (!parcel && sceneId.toLowerCase().endsWith('.eth')) return (await fetchWorldSceneId(worldName)).toLowerCase()
    return (await resolveWorldScene(worldName, sceneId, parcel, options)).sceneId
  }

  return {
    resolveWorldSceneId,
    resolveWorldScene,
    [STOP_COMPONENT]: async () => {
      permissionsCache.clear()
      sceneEntityMetadataCache.clear()
      scenesCache.clear()
      aboutCache.clear()
      parcelPermissionsCache.clear()
      permissionAddressesCache.clear()
    },
    fetchWorldSceneByEntityId,
    fetchWorldActionPermissions,
    fetchWorldSceneByPointer,
    fetchWorldSceneEntityMetadataById,
    fetchWorldSceneId,
    hasWorldOwnerPermission,
    hasWorldStreamingPermission,
    hasWorldDeployPermission,
    hasWorldAccessPermission,
    getWorldParcelPermissions,
    getWorldParcelPermissionAddresses
  }
}
