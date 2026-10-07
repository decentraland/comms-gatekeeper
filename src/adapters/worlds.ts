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
import { InvalidRequestError } from '../types/errors'

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
  const sceneEntityMetadataCache = cachedFetch.cache<{ metadata: WorldSceneEntityMetadata }>()
  const namesCache = cachedFetch.cache<NamesResponse>()

  async function fetchWorldActionPermissions(worldName: string): Promise<PermissionsOverWorld | undefined> {
    const response = await permissionsCache.fetch(
      `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/permissions`
    )
    return response
  }

  async function fetchWorldSceneByPointer(worldName: string, pointer: string): Promise<WorldScene | undefined> {
    const url = `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/scenes`
    logger.debug(`Fetching world scene for ${worldName} at pointer ${pointer}`)

    const response = await fetch.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [pointer] })
    })

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      logger.warn(`Failed to fetch world scene for ${worldName} at pointer ${pointer}: HTTP ${response.status}`)
      return undefined
    }

    const result = (await response.json()) as { scenes: WorldScene[]; total: number }

    if (!result.scenes || result.scenes.length === 0) {
      logger.debug(`No scene found for world ${worldName} at pointer ${pointer}`)
      return undefined
    }

    const scene = result.scenes.find((candidate) => candidate.parcels?.includes(pointer))
    if (!scene) {
      logger.warn('World scene response did not contain the requested parcel', { worldName, pointer })
      return undefined
    }
    logger.debug(`Found scene ${scene.entityId} for world ${worldName} at pointer ${pointer}`)
    return scene
  }

  async function fetchWorldSceneEntityMetadataById(entityId: string): Promise<WorldSceneEntityMetadata | undefined> {
    const url = `${worldContentUrl}/contents/${encodeURIComponent(entityId)}`
    logger.debug(`Fetching world scene entity metadata for ${entityId}`)

    const result = await sceneEntityMetadataCache.fetch(url)

    if (!result?.metadata?.scene) {
      logger.debug(`No scene entity metadata found for entity ID ${entityId}`)
      return undefined
    }

    logger.debug(`Found scene entity ${entityId} with base parcel ${result.metadata.scene.base}`)
    return result.metadata
  }

  /**
   * Resolves an entity against the live world index, without caching deployment membership.
   * @param worldName - World that must contain the deployment.
   * @param entityId - Requested deployment ID.
   * @returns The active scene and its base parcel, or undefined when it does not belong to the world.
   */
  async function fetchWorldSceneByEntityId(worldName: string, entityId: string): Promise<WorldScene | undefined> {
    entityId = entityId.toLowerCase()
    const metadata = await fetchWorldSceneEntityMetadataById(entityId)
    const declaredWorldName = metadata?.worldConfiguration?.name ?? metadata?.worldConfiguration?.dclName
    const sceneMetadata = metadata?.scene

    if (declaredWorldName && declaredWorldName.toLowerCase() !== worldName.toLowerCase()) {
      logger.warn(`Scene entity ${entityId} is not valid for world ${worldName}`)
      return undefined
    }

    if (sceneMetadata && !SceneParcels.validate(sceneMetadata)) {
      logger.warn(`Scene entity ${entityId} has invalid parcel metadata for world ${worldName}`)
      return undefined
    }

    if (sceneMetadata) {
      const scene = await fetchWorldSceneByPointer(worldName, sceneMetadata.base)
      if (
        !scene ||
        scene.entityId.toLowerCase() !== entityId.toLowerCase() ||
        !scene.parcels.includes(sceneMetadata.base)
      ) {
        logger.warn(`Scene entity ${entityId} is not active at ${sceneMetadata.base} in world ${worldName}`)
        return undefined
      }
      return { ...scene, baseParcel: sceneMetadata.base }
    }

    // Legacy entities may lack metadata. In that case, the world-scoped scenes
    // index is authoritative for both membership and the effective base parcel.
    const pageSize = 100
    const signal = AbortSignal.timeout(5000)
    let offset = 0
    let total = 1
    while (offset < total) {
      const response = await fetch.fetch(
        `${worldContentUrl}/world/${encodeURIComponent(worldName.toLowerCase())}/scenes?limit=${pageSize}&offset=${offset}`,
        { signal }
      )
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        return undefined
      }
      const result: { scenes?: WorldScene[]; total?: number } = await response.json()
      if (!result.scenes?.length) return undefined
      const scene = result.scenes.find((candidate) => candidate.entityId.toLowerCase() === entityId.toLowerCase())
      if (scene) {
        const baseParcel = scene.baseParcel ?? scene.parcels?.[0]
        return SceneParcels.validate({ base: baseParcel, parcels: scene.parcels })
          ? { ...scene, baseParcel }
          : undefined
      }
      total = result.total ?? 0
      offset += pageSize
    }
    return undefined
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
    const response = await fetch.fetch(url)

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new InvalidRequestError(`Failed to fetch world about for ${worldName}: HTTP ${response.status}`)
    }

    const about = (await response.json()) as {
      configurations?: { scenesUrn?: string[] }
    }

    const scenesUrn = about.configurations?.scenesUrn
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
   * @returns The lowercase content ID used by both authorization and LiveKit.
   * @throws InvalidRequestError when the scene does not belong to the requested world or parcel.
   */
  async function resolveWorldSceneId(worldName: string, sceneId: string, parcel?: string): Promise<string> {
    const isLegacyName = sceneId.toLowerCase().endsWith('.eth')
    try {
      if (parcel) {
        const scene = await fetchWorldSceneByPointer(worldName, parcel)
        if (!scene || (!isLegacyName && scene.entityId.toLowerCase() !== sceneId.toLowerCase())) {
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
      throw new InvalidRequestError(`Failed to resolve scene ID for world ${worldName}`)
    }
  }

  return {
    resolveWorldSceneId,
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
