import { AppComponents } from '../types'
import { ISocialComponent, PlayerBanResponse, PrivacySettings } from '../types/social.type'

export async function createSocialComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'fetch'>
): Promise<ISocialComponent> {
  const {
    config,
    logs,
    fetch: { fetch }
  } = components
  const socialServiceUrl = await config.requireString('SOCIAL_SERVICE_URL')
  const logger = logs.getLogger('social-component')

  async function getUserPrivacySettings(address: string): Promise<PrivacySettings> {
    const response = await fetch(`${socialServiceUrl}/v1/users/${address}/privacy-settings`)
    if (!response.ok) {
      logger.error(`Failed to fetch privacy settings for ${address}. Status: ${response.status}`)
      throw new Error(`Failed to fetch privacy settings for ${address}.`)
    }

    return response.json()
  }

  async function isPlayerBanned(address: string): Promise<boolean> {
    try {
      const response = await fetch(`${socialServiceUrl}/v1/moderation/users/${address}/bans`)
      if (!response.ok) {
        logger.warn(`Failed to fetch ban status for ${address}. Status: ${response.status}`)
        return false
      }

      const body: PlayerBanResponse = await response.json()
      return body.data.isBanned === true
    } catch (error) {
      logger.warn(`Error checking ban status for ${address}: ${error}`)
      return false
    }
  }

  return {
    getUserPrivacySettings,
    isPlayerBanned
  }
}
