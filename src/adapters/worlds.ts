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
      logger.warn(`World scene response did not contain the requested pointer ${pointer} in ${worldName}`)
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

  async function fetchWorldSceneByEntityId(worldName: string, entityId: string): Promise<WorldScene | undefined> {
    const metadata = await fetchWorldSceneEntityMetadataById(entityId)
    const declaredWorldName = metadata?.worldConfiguration?.name ?? metadata?.worldConfiguration?.dclName
    const sceneMetadata = metadata?.scene

    if (
      !declaredWorldName ||
      declaredWorldName.toLowerCase() !== worldName.toLowerCase() ||
      !SceneParcels.validate(sceneMetadata)
    ) {
      logger.warn(`Scene entity ${entityId} is not valid for world ${worldName}`)
      return undefined
    }

    const scene = await fetchWorldSceneByPointer(worldName, sceneMetadata.base)
    if (!scene || scene.entityId !== entityId || !scene.parcels.includes(sceneMetadata.base)) {
      logger.warn(`Scene entity ${entityId} is not active at ${sceneMetadata.base} in world ${worldName}`)
      return undefined
    }
    return { ...scene, baseParcel: sceneMetadata.base }
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

  /** Resolves the active scene at an exact parcel within the named world. */
  async function fetchWorldSceneId(worldName: string, pointer: string): Promise<string> {
    const scene = await fetchWorldSceneByPointer(worldName, pointer)
    if (!scene || !scene.parcels.includes(pointer)) {
      throw new InvalidRequestError(`No scene found for world ${worldName} at parcel ${pointer}`)
    }
    return scene.entityId
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

  return {
    fetchWorldActionPermissions,
    fetchWorldSceneByPointer,
    fetchWorldSceneByEntityId,
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
