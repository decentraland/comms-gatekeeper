import { ensureSlashAtTheEnd } from '../logic/utils'
import { AppComponents } from '../types'
import { LandPermissionsNotFoundError } from '../types/errors'
import { ILandComponent, LandsParcelPermissionsResponse } from '../types/lands.type'

export async function createLandsComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs'>
): Promise<ILandComponent> {
  const { config, cachedFetch, logs } = components
  const logger = logs.getLogger('land-component')

  const lambdasUrl = await config.requireString('LAMBDAS_URL')

  async function getLandUpdatePermission(
    authAddress: string,
    placePositions: string[]
  ): Promise<LandsParcelPermissionsResponse> {
    const baseUrl = ensureSlashAtTheEnd(lambdasUrl)
    if (!baseUrl) {
      logger.info('Lambdas URL is not set')
      throw new Error('Lambdas URL is not set')
    }

    const position = placePositions[0].split(',')
    const parcelPermissionsResponse = await cachedFetch
      .cache<LandsParcelPermissionsResponse>()
      .fetch(`${baseUrl}users/${authAddress}/parcels/${position[0]}/${position[1]}/permissions`)

    if (!parcelPermissionsResponse) {
      logger.info(`Land permissions not found for ${authAddress} at ${position[0]},${position[1]}`)
      throw new LandPermissionsNotFoundError(
        `Land permissions not found for ${authAddress} at ${position[0]},${position[1]}`
      )
    }

    return parcelPermissionsResponse
  }

  return {
    getLandUpdatePermission
  }
}
