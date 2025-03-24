import { AppComponents } from '../types'
import { PlaceNotFoundError } from '../types/errors'
import { IPlacesComponent, PlaceAttributes, PlaceResponse } from '../types/places.type'

export async function createPlacesComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs'>
): Promise<IPlacesComponent> {
  const { config, cachedFetch, logs } = components

  const logger = logs.getLogger('places-component')

  const placesApiUrl = await config.requireString('PLACES_API_URL')

  const fetchFromCache = cachedFetch.cache<PlaceResponse>()
  async function getPlaceByParcel(parcel: string): Promise<PlaceAttributes> {
    const response = await fetchFromCache.fetch(`${placesApiUrl}/places?positions=${parcel}`)

    if (!response?.data?.length) {
      logger.info(`No place found with parcel ${parcel}`)
      throw new PlaceNotFoundError(`No place found with parcel ${parcel}`)
    }

    return response.data[0]
  }

  async function getPlaceByWorldName(worldName: string): Promise<PlaceAttributes> {
    const response = await fetchFromCache.fetch(`${placesApiUrl}/worlds?names=${worldName}`)

    if (!response?.data?.length) {
      logger.info(`No world found with name ${worldName}`)
      throw new PlaceNotFoundError(`No world found with name ${worldName}`)
    }

    return response.data[0]
  }

  return {
    getPlaceByParcel,
    getPlaceByWorldName
  }
}
