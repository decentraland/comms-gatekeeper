import { AppComponents, NamesResponse } from '../types'
import { ensureSlashAtTheEnd } from '../logic/utils'
import { IWorldComponent, PermissionsOverWorld, PermissionType } from '../types/worlds.type'
import { InvalidRequestError } from '../types/errors'

export async function createWorldsComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs'>
): Promise<IWorldComponent> {
  const { config, cachedFetch, logs } = components
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
      permissionsOverWorld?.permissions.streaming.type === PermissionType.AllowList &&
      permissionsOverWorld.permissions.streaming.wallets.includes(authAddress)
    )
  }

  async function hasWorldDeployPermission(authAddress: string, worldName: string): Promise<boolean> {
    const permissionsOverWorld = await fetchWorldActionPermissions(worldName)

    return (
      permissionsOverWorld?.permissions.deployment.type === PermissionType.AllowList &&
      permissionsOverWorld.permissions.deployment.wallets.includes(authAddress)
    )
  }

  return {
    fetchWorldActionPermissions,
    hasWorldOwnerPermission,
    hasWorldStreamingPermission,
    hasWorldDeployPermission
  }
}
