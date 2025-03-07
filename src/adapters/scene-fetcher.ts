import { IBaseComponent } from '@well-known-components/interfaces'
import {
  AddressResource,
  AddressResourceResponse,
  AppComponents,
  InvalidRequestError,
  LandsResponse,
  Permissions,
  PlaceAttributes
} from '../types'
import { LRUCache } from 'lru-cache'
import { formatUrl } from '../controllers/handlers/utils'
import { ISceneAdminManager } from './scene-admin-manager'

export type ISceneFetcherComponent = IBaseComponent & {
  fetchWorldPermissions(worldName: string): Promise<Permissions | undefined>
  fetchScenePermissions: (sceneId: string) => Promise<Permissions | undefined>
  getPlaceByParcel(parcel: string): Promise<PlaceAttributes>
  getWorldByName(worldName: string): Promise<PlaceAttributes>
  getPlace(isWorlds: boolean, realmName: string, parcel: string): Promise<PlaceAttributes>
  getAddressResources<T extends AddressResource>(address: string, resource: T): Promise<AddressResourceResponse<T>>
  hasLandPermission(authAddress: string, placePositions: string[]): Promise<boolean>
  hasWorldPermission(authAddress: string, worldName: string): Promise<boolean>
  isPlaceAdmin(placeId: string, address: string): Promise<boolean>
}

export async function createSceneFetcherComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'logs' | 'sceneAdminManager'>
): Promise<ISceneFetcherComponent> {
  const { config, fetch, logs, sceneAdminManager } = components

  const logger = logs.getLogger('scene-fetcher')

  const [worldContentUrl, catalystContentUrl, placesApiUrl, lambdasUrl] = await Promise.all([
    config.requireString('WORLD_CONTENT_URL'),
    config.requireString('CATALYST_CONTENT_URL'),
    config.requireString('PLACES_API_URL'),
    config.requireString('LAMBDAS_URL')
  ])

  const sceneByWold = new LRUCache<string, string>({
    max: 1000,
    ttl: 1000 * 60 * 5, // 5 min
    fetchMethod: async function (worldName: string, _staleValue: string | void): Promise<string> {
      try {
        const response = await fetch.fetch(`${worldContentUrl}/world/${worldName}/about`)
        const about = await response.json()

        const sceneUrn = about.configurations.scenesUrn[0]
        const fragments = sceneUrn.split('?')
        const urn = fragments[0]
        const urnFragments = urn.split(':')
        const sceneId = urnFragments[urnFragments.length - 1]

        return sceneId
      } catch (err: any) {
        logger.warn(err)
        return ''
      }
    }
  })

  const permissionsCache = new LRUCache<string, Permissions>({
    max: 1000,
    ttl: 1000 * 60 * 5, // 5 min
    fetchMethod: async function (url: string, _staleValue: Permissions | void): Promise<Permissions> {
      try {
        const response = await fetch.fetch(url)
        const scene = await response.json()
        logger.log(scene)

        // TODO
        return {
          cast: [],
          mute: []
        }
      } catch (err: any) {
        logger.warn(err)
        return {
          cast: [],
          mute: []
        }
      }
    }
  })

  async function fetchWorldPermissions(worldName: string): Promise<Permissions | undefined> {
    const sceneId = await sceneByWold.fetch(worldName)
    if (!sceneId) {
      return undefined
    }

    return permissionsCache.fetch(`${worldContentUrl}/contents/${sceneId}`)
  }

  async function fetchScenePermissions(sceneId: string): Promise<Permissions | undefined> {
    return permissionsCache.fetch(`${catalystContentUrl}/contents/${sceneId}`)
  }

  async function getPlaceByParcel(parcel: string): Promise<PlaceAttributes> {
    try {
      const response = await fetch.fetch(`${placesApiUrl}/places?positions=${parcel}`)

      if (!response.ok) {
        throw new Error(`Error getting place information: ${response.status}`)
      }

      const data = await response.json()

      if (!data?.data?.length) {
        throw new Error(`No place found with parcel ${parcel}`)
      }

      const placeInfo = data.data[0]
      if (!placeInfo.positions?.includes(parcel)) {
        throw new Error(`The parcel ${parcel} is not included in the positions of the found place`)
      }

      return placeInfo
    } catch (error) {
      console.error(`Error getting place information: ${error}`)
      throw error instanceof Error ? error : new Error(`Failed to get place info: ${error}`)
    }
  }

  async function getWorldByName(worldName: string): Promise<PlaceAttributes> {
    try {
      const response = await fetch.fetch(`${placesApiUrl}/worlds?names=${worldName}`)

      if (!response.ok) {
        throw new Error(`Error getting world information: ${response.status}`)
      }

      const data = await response.json()

      if (!data?.data?.length) {
        throw new Error(`No world found with name ${worldName}`)
      }

      const worldInfo = data.data[0]
      if (worldInfo.world_name !== worldName) {
        throw new Error(`The world_name ${worldInfo.world_name} does not match the requested realmName ${worldName}`)
      }

      return worldInfo
    } catch (error) {
      console.error(`Error getting world information: ${error}`)
      throw error instanceof Error ? error : new Error(`Failed to get world info: ${error}`)
    }
  }

  async function getPlace(isWorlds: boolean, realmName: string, parcel: string): Promise<PlaceAttributes> {
    if (isWorlds) {
      const worldInfo = await getWorldByName(realmName)
      if (!worldInfo) {
        throw new InvalidRequestError('Could not find world information')
      }
      return worldInfo
    }

    const sceneInfo = await getPlaceByParcel(parcel)
    if (!sceneInfo) {
      throw new InvalidRequestError('Could not find scene information')
    }
    return sceneInfo
  }

  async function getAddressResources<T extends AddressResource>(
    address: string,
    resource: T
  ): Promise<AddressResourceResponse<T>> {
    try {
      const baseUrl = formatUrl(lambdasUrl)
      const response = await fetch.fetch(`${baseUrl}users/${address}/${resource}`)

      if (!response.ok) {
        throw new Error(`Error getting ${resource} information: ${response.status}`)
      }

      const data = await response.json()

      return data as AddressResourceResponse<T>
    } catch (error) {
      console.error(`Error getting ${resource} for wallet ${address}: ${error}`)
      throw error instanceof Error ? error : new Error(`Failed to get ${resource} for wallet: ${error}`)
    }
  }

  async function hasLandPermission(authAddress: string, placePositions: string[]): Promise<boolean> {
    if (!placePositions?.length) return false

    const landsResponse = (await getAddressResources(authAddress, 'lands')) as LandsResponse
    if (!landsResponse.elements?.length) return false

    const userParcelPositions = landsResponse.elements
      .filter((element) => element.category === 'parcel')
      .map((parcel) => `${parcel.x},${parcel.y}`)

    return placePositions.some((pos) => userParcelPositions.includes(pos))
  }

  async function hasWorldPermission(authAddress: string, worldName: string): Promise<boolean> {
    if (!worldName) return false

    let nameToValidate = worldName.toLowerCase()

    if (nameToValidate.endsWith('.dcl.eth')) {
      nameToValidate = nameToValidate.slice(0, -8)
    } else if (nameToValidate.endsWith('.eth')) {
      nameToValidate = nameToValidate.slice(0, -4)
    }

    const namesResponse = await getAddressResources(authAddress, 'names')

    if (!namesResponse.elements?.length) return false

    return namesResponse.elements.some((element) => element.name.toLowerCase() === nameToValidate)
  }

  async function isPlaceAdmin(placeId: string, address: string): Promise<boolean> {
    try {
      const isAdmin = await sceneAdminManager.isAdmin(placeId, address)
      return isAdmin
    } catch (error) {
      console.error(`Error checking if address is admin: ${error}`)
      return false
    }
  }

  return {
    fetchWorldPermissions,
    fetchScenePermissions,
    getPlaceByParcel,
    getWorldByName,
    getPlace,
    getAddressResources,
    hasLandPermission,
    hasWorldPermission,
    isPlaceAdmin
  }
}
