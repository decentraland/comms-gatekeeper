import { AppComponents, PlaceNotFoundError } from '../types'
import { IPlacesComponent, PlaceAttributes, PlaceResponse } from '../types/places.type'

export async function createPlacesComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs'>
): Promise<IPlacesComponent> {
  const { config, cachedFetch, logs } = components

  const logger = logs.getLogger('places-component')

  const [placesApiUrl] = await Promise.all([config.requireString('PLACES_API_URL')])

  const fetchFromCache = cachedFetch.cache<PlaceResponse>()
  async function getPlaceByParcel(parcel: string): Promise<PlaceAttributes> {
    cachedFetch.cache

    const response = await fetchFromCache.fetch(`${placesApiUrl}/places?positions=${parcel}`)

    if (!response?.ok) {
      logger.info(`Error getting place information: ${parcel}`)
      throw new Error(`Error getting place information: ${parcel}`)
    }

    if (!response.data?.length) {
      logger.info(`No place found with parcel ${parcel}`)
      throw new Error(`No place found with parcel ${parcel}`)
    }

    const placeInfo = response.data[0]
    if (!placeInfo.positions?.includes(parcel)) {
      logger.info(`The parcel ${parcel} is not included in the positions of the found place`)
      throw new Error(`The parcel ${parcel} is not included in the positions of the found place`)
    }

    return placeInfo
  }

  async function getWorldByName(worldName: string): Promise<PlaceAttributes> {
    const response = await fetchFromCache.fetch(`${placesApiUrl}/worlds?names=${worldName}`)

    if (!response?.ok) {
      logger.info(`Error getting world information: ${worldName}`)
      throw new PlaceNotFoundError(`Error getting world information: ${worldName}`)
    }

    if (!response.data?.length) {
      logger.info(`No world found with name ${worldName}`)
      throw new PlaceNotFoundError(`No world found with name ${worldName}`)
    }

    const worldInfo = response.data[0]
    if (worldInfo.world_name !== worldName) {
      logger.info(`The world_name ${worldInfo.world_name} does not match the requested realmName ${worldName}`)
      throw new PlaceNotFoundError(
        `The world_name ${worldInfo.world_name} does not match the requested realmName ${worldName}`
      )
    }

    return worldInfo
  }

  async function getPlace(isWorlds: boolean, realmName: string, parcel: string): Promise<PlaceAttributes> {
    if (isWorlds) {
      const worldInfo = await getWorldByName(realmName)
      if (!worldInfo) {
        logger.info(`Could not find world information`)
        throw new PlaceNotFoundError('Could not find world information')
      }
      return worldInfo
    }

    const sceneInfo = await getPlaceByParcel(parcel)
    if (!sceneInfo) {
      logger.info(`Could not find scene information`)
      throw new PlaceNotFoundError('Could not find scene information')
    }
    return sceneInfo
  }

  return {
    getPlaceByParcel,
    getWorldByName,
    getPlace
  }
}
