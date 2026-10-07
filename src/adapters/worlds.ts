import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { AsyncLocalStorage } from 'async_hooks'
import { LRUCache } from 'lru-cache'
import { SceneParcels } from '@dcl/schemas'
import { AppComponents, NamesResponse } from '../types'
import { ensureSlashAtTheEnd } from '../logic/utils'
import {
  IWorldComponent,
  PermissionsOverWorld,
  PermissionType,
  WorldScene,
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

  const permissionsCache = cachedFetch.cache<PermissionsOverWorld>()
  const sceneEntityMetadataCache = new LRUCache<string, WorldSceneEntityMetadata>({ max: 1000, ttl: 300000 })
  const requestScenes = new AsyncLocalStorage<Map<string, Promise<WorldScene | undefined>>>()
  const requestTimeout = (await config.getNumber('WORLD_SCENE_REQUEST_TIMEOUT_MS')) ?? 5000

  function withSceneResolutionScope<T>(action: () => Promise<T>): Promise<T> {
    return requestScenes.run(new Map(), action)
  }

  function oncePerRequest(key: string, lookup: () => Promise<WorldScene | undefined>): Promise<WorldScene | undefined> {
    const scope = requestScenes.getStore()
    const pending = scope?.get(key)
    if (pending) return pending
    const result = lookup()
    scope?.set(key, result)
    return result
  }

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

  async function fetchWorldActionPermissions(worldName: string): Promise<PermissionsOverWorld | undefined> {
    const response = await permissionsCache.fetch(
      `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/permissions`
    )
    return response
  }

  async function fetchWorldSceneByPointer(worldName: string, pointer: string): Promise<WorldScene | undefined> {
    return oncePerRequest(JSON.stringify(['parcel', worldName.toLowerCase(), pointer]), async () => {
      const result = await fetchWorldJson<{ scenes: WorldScene[] }>(
        `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/scenes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coordinates: [pointer] })
        }
      )
      return result?.scenes?.find((scene) => scene.parcels?.includes(pointer))
    })
  }

  async function fetchWorldSceneEntityMetadataById(entityId: string): Promise<WorldSceneEntityMetadata | undefined> {
    const cached = sceneEntityMetadataCache.get(entityId)
    if (cached) return cached
    const entity = await fetchWorldJson<{ metadata?: WorldSceneEntityMetadata }>(
      `${worldContentUrl}/contents/${encodeURIComponent(entityId)}`
    )
    // Content-addressed metadata is immutable; misses and live membership are never cached across requests.
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
    return oncePerRequest(JSON.stringify(['entity', worldName.toLowerCase(), entityId.toLowerCase()]), async () => {
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
    })
  }

  async function hasWorldOwnerPermission(authAddress: string, worldName: string): Promise<boolean> {
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

    const namesResponse = await namesCache.fetch(
      `${baseUrl}users/${encodeURIComponent(authAddress.toLowerCase())}/names`
    )

    if (!namesResponse?.elements?.length) return false

    return namesResponse.elements.some((element) => element.name.toLowerCase() === nameToValidate)
  }

  async function hasWorldStreamingPermission(authAddress: string, worldName: string): Promise<boolean> {
    const permissionsOverWorld = await fetchWorldActionPermissions(worldName)
    const lowerAuthAddress = authAddress.toLowerCase()

    return (
      permissionsOverWorld?.permissions?.streaming.type === PermissionType.AllowList &&
      permissionsOverWorld.permissions.streaming.wallets.some((wallet) => wallet.toLowerCase() === lowerAuthAddress)
    )
  }

  async function hasWorldDeployPermission(authAddress: string, worldName: string): Promise<boolean> {
    const permissionsOverWorld = await fetchWorldActionPermissions(worldName)
    const lowerAuthAddress = authAddress.toLowerCase()

    return (
      permissionsOverWorld?.permissions?.deployment.type === PermissionType.AllowList &&
      permissionsOverWorld.permissions.deployment.wallets.some((wallet) => wallet.toLowerCase() === lowerAuthAddress)
    )
  }

  async function getWorldParcelPermissions(
    address: string,
    worldName: string,
    permissionName: string
  ): Promise<string[] | undefined> {
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

  /**
   * Fetches all addresses that have the given permission over the specified parcels in a world.
   * Uses `POST /world/:world_name/permissions/:permission_name/parcels` with `{ parcels }`.
   */
  async function getWorldParcelPermissionAddresses(
    worldName: string,
    permissionName: string,
    parcels: string[]
  ): Promise<string[]> {
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

  /**
   * Fetches the scene entity ID for a world from its about endpoint.
   * Parses the first entry in configurations.scenesUrn to extract the content hash.
   * @throws InvalidRequestError if the request fails, no scenes exist, or the URN format is invalid.
   */
  async function fetchWorldSceneId(worldName: string): Promise<string> {
    const url = `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/about`
    const about = await fetchWorldJson<{ configurations?: { scenesUrn?: string[] } }>(url)

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
   * @param options - Joins may retain an old ID whose metadata proves the same world and current footprint.
   * @returns The lowercase content ID used by both authorization and LiveKit.
   * @throws InvalidRequestError when the scene does not belong to the requested world or parcel.
   * @throws ServiceUnavailableError when the upstream cannot verify the scene.
   */
  async function resolveWorldSceneId(
    worldName: string,
    sceneId: string,
    parcel?: string,
    options?: { allowPreviousDeployment?: boolean }
  ): Promise<string> {
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
              return sceneId.toLowerCase()
            }
          }
          throw new InvalidRequestError(`Scene ${sceneId} is not active at ${parcel} in world ${worldName}`)
        }
        return scene.entityId.toLowerCase()
      }
      if (isLegacyName) return (await fetchWorldSceneId(worldName)).toLowerCase()
      const scene = await fetchWorldSceneByEntityId(worldName, sceneId)
      if (!scene) throw new InvalidRequestError(`Scene ${sceneId} is not active in world ${worldName}`)
      return scene.entityId.toLowerCase()
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

  return {
    resolveWorldSceneId,
    withSceneResolutionScope,
    [STOP_COMPONENT]: async () => {
      requestScenes.disable()
      sceneEntityMetadataCache.clear()
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
