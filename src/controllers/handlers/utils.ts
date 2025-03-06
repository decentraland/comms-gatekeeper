import { DecentralandSignatureData, verify } from '@dcl/platform-crypto-middleware'
import {
  HandlerContextWithPath,
  UnauthorizedError,
  AddressResource,
  AddressResourceResponse,
  AuthData,
  PlaceAttributes,
  InvalidRequestError,
  LandsResponse
} from '../../types'
import { ISceneAdminManager } from '../../adapters/scene-admin-manager'

export async function validate<T extends string>(
  context: HandlerContextWithPath<'fetch' | 'config', T>
): Promise<AuthData> {
  const { config, fetch } = context.components
  const baseUrl = (await config.getString('HTTP_BASE_URL')) || `${context.url.protocol}//${context.url.host}`
  const path = new URL(baseUrl + context.url.pathname)
  let verification: DecentralandSignatureData<AuthData>
  try {
    verification = await verify(context.request.method, path.pathname, context.request.headers.raw(), {
      fetcher: fetch
    })
  } catch (e) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request')
  }

  const { realmName, sceneId, parcel, hostname } = verification.authMetadata
  if (!realmName) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request, no realmName')
  }

  const identity = verification.auth

  return {
    identity,
    realmName,
    sceneId,
    parcel,
    hostname
  }
}

export async function getPlaceByParcel(placesApiUrl: string, parcel: string): Promise<PlaceAttributes> {
  try {
    const response = await fetch(`${placesApiUrl}/places?positions=${parcel}`)

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

export async function getWorldByName(placesApiUrl: string, worldName: string): Promise<PlaceAttributes> {
  try {
    const response = await fetch(`${placesApiUrl}/worlds?names=${worldName}`)

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

export async function getPlace(
  placesApiUrl: string,
  isWorlds: boolean,
  realmName: string,
  parcel: string
): Promise<PlaceAttributes> {
  if (isWorlds) {
    const worldInfo = await getWorldByName(placesApiUrl, realmName)
    if (!worldInfo) {
      throw new InvalidRequestError('Could not find world information')
    }
    return worldInfo
  }

  const sceneInfo = await getPlaceByParcel(placesApiUrl, parcel)
  if (!sceneInfo) {
    throw new InvalidRequestError('Could not find scene information')
  }
  return sceneInfo
}

export function formatUrl(url: string): string {
  if (!url) return '/'
  return url.endsWith('/') ? url : `${url}/`
}

export async function getAddressResources<T extends AddressResource>(
  lambdasUrl: string,
  address: string,
  resource: T
): Promise<AddressResourceResponse<T>> {
  try {
    const baseUrl = formatUrl(lambdasUrl)
    const response = await fetch(`${baseUrl}users/${address}/${resource}`)

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

export async function fetchDenyList(): Promise<Set<string>> {
  try {
    const response = await fetch('https://config.decentraland.org/denylist.json')
    if (!response.ok) {
      throw new Error(`Failed to fetch deny list, status: ${response.status}`)
    }
    const data = await response.json()
    if (data.users && Array.isArray(data.users)) {
      return new Set(data.users.map((user: { wallet: string }) => user.wallet.toLocaleLowerCase()))
    } else {
      console.warn('Deny list is missing "users" field or it is not an array.')
      return new Set()
    }
  } catch (error) {
    console.error(`Error fetching deny list: ${(error as Error).message}`)
    return new Set()
  }
}

export async function hasLandPermission(
  lambdasUrl: string,
  authAddress: string,
  placePositions: string[]
): Promise<boolean> {
  if (!placePositions?.length) return false

  const landsResponse = (await getAddressResources(lambdasUrl, authAddress, 'lands')) as LandsResponse
  if (!landsResponse.elements?.length) return false

  const userParcelPositions = landsResponse.elements
    .filter((element) => element.category === 'parcel')
    .map((parcel) => `${parcel.x},${parcel.y}`)

  return placePositions.some((pos) => userParcelPositions.includes(pos))
}

export async function hasWorldPermission(lambdasUrl: string, authAddress: string, worldName: string): Promise<boolean> {
  if (!worldName) return false

  let nameToValidate = worldName.toLowerCase()

  if (nameToValidate.endsWith('.dcl.eth')) {
    nameToValidate = nameToValidate.slice(0, -8)
  } else if (nameToValidate.endsWith('.eth')) {
    nameToValidate = nameToValidate.slice(0, -4)
  }

  const namesResponse = await getAddressResources(lambdasUrl, authAddress, 'names')

  if (!namesResponse.elements?.length) return false

  return namesResponse.elements.some((element) => element.name.toLowerCase() === nameToValidate)
}

export async function isPlaceAdmin(
  sceneAdminManager: ISceneAdminManager,
  placeId: string,
  address: string
): Promise<boolean> {
  try {
    const isAdmin = await sceneAdminManager.isAdmin(placeId, address)
    return isAdmin
  } catch (error) {
    console.error(`Error checking if address is admin: ${error}`)
    return false
  }
}

export function isValidAddress(address: string): boolean {
  if (typeof address !== 'string' || !address) return false
  return /^0x[a-fA-F0-9]{40}$/i.test(address)
}

export function validateFilters(filters: { admin?: string }): {
  valid: boolean
  error?: string
  value: { admin?: string }
} {
  if (filters.admin !== undefined && typeof filters.admin !== 'string') {
    return {
      valid: false,
      error: 'admin must be a string',
      value: {}
    }
  }

  return {
    valid: true,
    value: {
      admin: filters.admin ? filters.admin.toLowerCase() : undefined
    }
  }
}
