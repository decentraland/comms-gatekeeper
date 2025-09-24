import { EthAddress, Profile } from '@dcl/schemas'
import { ensureSlashAtTheEnd } from '../logic/utils'
import { AppComponents } from '../types'
import { INamesComponent } from '../types/names.type'
import { ProfilesNotFoundError } from '../types/errors'

export async function createNamesComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'logs'>
): Promise<INamesComponent> {
  const { config, fetch, logs } = components
  const logger = logs.getLogger('names-component')

  const lambdasUrl = await config.requireString('LAMBDAS_URL')

  async function getNamesFromAddresses(addresses: string[]): Promise<Record<string, string>> {
    const baseUrl = ensureSlashAtTheEnd(lambdasUrl)
    if (!baseUrl) {
      logger.error('Lambdas URL is not set')
      throw new Error('Lambdas URL is not set')
    }

    const profilesResponse = await fetch.fetch(`${baseUrl}profiles`, {
      method: 'POST',
      body: JSON.stringify({ ids: addresses })
    })
    const profiles = (await profilesResponse.json()) as Profile[]
    if (!profiles || profiles.length === 0) {
      logger.info(`Profiles not found for ${addresses}`)
      throw new ProfilesNotFoundError(`Profiles not found for ${addresses}`)
    }

    return profiles.reduce((acc, profile) => {
      const avatar = profile.avatars[0]
      const name = avatar.hasClaimedName ? avatar.name : `${avatar.name}#${avatar.ethAddress.slice(-4)}`
      return { ...acc, [avatar.ethAddress]: name }
    }, {})
  }

  async function getNameOwner(name: string): Promise<EthAddress | null> {
    const baseUrl = ensureSlashAtTheEnd(lambdasUrl)
    if (!baseUrl) {
      logger.error('Lambdas URL is not set')
      throw new Error('Lambdas URL is not set')
    }

    const nameOwnerResponse = await fetch.fetch(`${baseUrl}names/${name}/owner`)
    const nameOwner = (await nameOwnerResponse.json()) as { owner: string }
    return nameOwner.owner
  }

  return {
    getNamesFromAddresses,
    getNameOwner
  }
}
