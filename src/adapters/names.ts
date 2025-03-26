import { Profile } from '@dcl/schemas'
import { ensureSlashAtTheEnd } from '../logic/utils'
import { AppComponents } from '../types'
import { INamesComponent } from '../types/names.type'
import { ProfilesNotFoundError } from '../types/errors'

export async function createNamesComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs'>
): Promise<INamesComponent> {
  const { config, cachedFetch, logs } = components
  const logger = logs.getLogger('names-component')

  const lambdasUrl = await config.requireString('LAMBDAS_URL')

  async function getNamesFromAddresses(addresses: string[]): Promise<Record<string, string>> {
    const baseUrl = ensureSlashAtTheEnd(lambdasUrl)
    if (!baseUrl) {
      logger.info('Lambdas URL is not set')
      throw new Error('Lambdas URL is not set')
    }

    const profilesResponse = await cachedFetch.cache<Profile[]>().post(`${baseUrl}profiles`, { ids: addresses })
    if (!profilesResponse || profilesResponse.length === 0) {
      logger.info(`Profiles not found for ${addresses}`)
      throw new ProfilesNotFoundError(`Profiles not found for ${addresses}`)
    }

    const profiles = profilesResponse.map((profile) => {
      return {
        [profile.avatars[0].ethAddress]: profile.avatars[0].name
      }
    })

    return profiles.reduce((acc, profile) => ({ ...acc, ...profile }), {})
  }

  return {
    getNamesFromAddresses
  }
}
