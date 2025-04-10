import { AppComponents } from '../types'
import { PrivacySettings } from '../types/social.type'
import { ISocialComponent } from '../types/social.type'

export async function createSocialComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'fetch'>
): Promise<ISocialComponent> {
  const {
    config,
    logs,
    fetch: { fetch }
  } = components
  const socialServiceUrl = config.requireString('SOCIAL_SERVICE_URL')
  const logger = logs.getLogger('social-component')

  async function getUserPrivacySettings(address: string): Promise<PrivacySettings> {
    const response = await fetch(`${socialServiceUrl}/v1/users/${address}/privacy-settings`)
    if (!response.ok) {
      logger.error(`Failed to fetch privacy settings for ${address}. Status: ${response.status}`)
      throw new Error(`Failed to fetch privacy settings for ${address}.`)
    }

    return response.json()
  }

  return {
    getUserPrivacySettings
  }
}
