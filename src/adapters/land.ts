import { ensureSlashAtTheEnd } from '../logic/utils'
import { AppComponents, LandsResponse } from '../types'
import { ILandComponent } from '../types/land.type'

export async function createLandComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs'>
): Promise<ILandComponent> {
  const { config, cachedFetch, logs } = components
  const logger = logs.getLogger('land-component')

  const [lambdasUrl] = await Promise.all([config.requireString('LAMBDAS_URL')])

  async function hasLandPermission(authAddress: string, placePositions: string[]): Promise<boolean> {
    if (!placePositions?.length) return false

    const baseUrl = ensureSlashAtTheEnd(lambdasUrl)
    if (!baseUrl) {
      logger.info('Lambdas URL is not set')
      throw new Error('Lambdas URL is not set')
    }

    const landsResponse = await cachedFetch.cache<LandsResponse>().fetch(`${baseUrl}users/${authAddress}/lands`)

    if (!landsResponse?.elements?.length) return false

    const userParcelPositions = landsResponse.elements
      .filter((element) => element.category === 'parcel')
      .map((parcel) => `${parcel.x},${parcel.y}`)

    return placePositions.some((pos) => userParcelPositions.includes(pos))
  }

  return {
    hasLandPermission
  }
}
