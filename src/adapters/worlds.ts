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

  async function fetchWorldActionPermissions(worldName: string): Promise<PermissionsOverWorld | undefined> {
    const fetchFromCache = cachedFetch.cache<PermissionsOverWorld>()
    const response = await fetchFromCache.fetch(`${worldContentUrl}/world/${worldName.toLowerCase()}/permissions`)
    return response
  }

  async function fetchWorldSceneByPointer(worldName: string, pointer: string): Promise<WorldScene | undefined> {
    const url = `${worldContentUrl}/world/${worldName.toLowerCase()}/scenes`
    logger.debug(`Fetching world scene for ${worldName} at pointer ${pointer}`)

    const response = await fetch.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointers: [pointer] })
    })

    if (!response.ok) {
      logger.warn(`Failed to fetch world scene for ${worldName} at pointer ${pointer}: HTTP ${response.status}`)
      return undefined
    }

    const result = (await response.json()) as { scenes: WorldScene[]; total: number }

    if (!result.scenes || result.scenes.length === 0) {
      logger.debug(`No scene found for world ${worldName} at pointer ${pointer}`)
      return undefined
    }

    const scene = result.scenes[0]
    logger.debug(`Found scene ${scene.entityId} for world ${worldName} at pointer ${pointer}`)
    return scene
  }

  async function fetchWorldSceneEntityMetadataById(entityId: string): Promise<WorldSceneEntityMetadata | undefined> {
    const url = `${worldContentUrl}/contents/${entityId}`
    logger.debug(`Fetching world scene entity metadata for ${entityId}`)

    const fetchFromCache = cachedFetch.cache<{ metadata: WorldSceneEntityMetadata }>()
    const result = await fetchFromCache.fetch(url)

    if (!result?.metadata?.scene) {
      logger.debug(`No scene entity metadata found for entity ID ${entityId}`)
      return undefined
    }

    logger.debug(`Found scene entity ${entityId} with base parcel ${result.metadata.scene.base}`)
    return result.metadata
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

    const namesResponse = await cachedFetch.cache<NamesResponse>().fetch(`${baseUrl}users/${authAddress}/names`)

    if (!namesResponse?.elements?.length) return false

    return namesResponse.elements.some((element) => element.name.toLowerCase() === nameToValidate)
  }

  async function hasWorldStreamingPermission(authAddress: string, worldName: string): Promise<boolean> {
    const permissionsOverWorld = await fetchWorldActionPermissions(worldName)

    return (
      permissionsOverWorld?.permissions?.streaming.type === PermissionType.AllowList &&
      permissionsOverWorld.permissions.streaming.wallets.includes(authAddress)
    )
  }

  async function hasWorldDeployPermission(authAddress: string, worldName: string): Promise<boolean> {
    const permissionsOverWorld = await fetchWorldActionPermissions(worldName)

    return (
      permissionsOverWorld?.permissions?.deployment.type === PermissionType.AllowList &&
      permissionsOverWorld.permissions.deployment.wallets.includes(authAddress)
    )
  }

  async function getWorldParcelPermissions(
    address: string,
    worldName: string,
    permissionName: string
  ): Promise<string[]> {
    const url = `${worldContentUrl}/world/${worldName.toLowerCase()}/permissions/${permissionName}/address/${address.toLowerCase()}/parcels`
    const response = await cachedFetch.cache<{ total: number; parcels: string[] }>().fetch(url)
    return response?.parcels ?? []
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
    fetchWorldSceneEntityMetadataById,
    hasWorldOwnerPermission,
    hasWorldStreamingPermission,
    hasWorldDeployPermission,
    hasWorldAccessPermission,
    getWorldParcelPermissions
  }
}
