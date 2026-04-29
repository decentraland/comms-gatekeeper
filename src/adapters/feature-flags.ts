import { IBaseComponent, START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { ApplicationName, FeatureFlagVariant } from '@well-known-components/features-component'
import { AppComponents } from '../types'

export enum FeatureFlag {
  // Feature flag for platform user moderators.
  // The variant should contain a comma-separated list of wallet addresses.
  PLATFORM_USER_MODERATORS = 'platform_user_moderators'
}

export type IFeatureFlagsAdapter = IBaseComponent & {
  isEnabled: (feature: FeatureFlag) => boolean
  getVariants: <T>(feature: FeatureFlag) => Promise<T | undefined>
}

export async function createFeatureFlagsAdapter(
  components: Pick<AppComponents, 'logs' | 'features' | 'config'>
): Promise<IFeatureFlagsAdapter> {
  const { logs, features, config } = components

  const logger = logs.getLogger('feature-flags-adapter')
  const refreshIntervalInMs = (await config.getNumber('FEATURE_FLAG_REFRESH_INTERVAL_IN_MS')) || 4 * 60 * 1000

  const featuresFlagMap = new Map<FeatureFlag, boolean>()
  const variantsMap = new Map<FeatureFlag, FeatureFlagVariant | null>()

  let refreshInterval: NodeJS.Timeout | null = null

  async function refresh() {
    try {
      const [isPlatformUserModeratorsEnabled, platformUserModeratorsVariant] = await Promise.all([
        features.getIsFeatureEnabled(ApplicationName.DAPPS, FeatureFlag.PLATFORM_USER_MODERATORS),
        features.getFeatureVariant(ApplicationName.DAPPS, FeatureFlag.PLATFORM_USER_MODERATORS)
      ])

      featuresFlagMap.set(FeatureFlag.PLATFORM_USER_MODERATORS, isPlatformUserModeratorsEnabled)
      variantsMap.set(FeatureFlag.PLATFORM_USER_MODERATORS, platformUserModeratorsVariant)
    } catch (error) {
      logger.error('Failed to refresh feature flags', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async function getVariants<T>(feature: FeatureFlag): Promise<T | undefined> {
    const variant = variantsMap.get(feature)

    if (variant?.payload?.value) {
      const values = variant.payload.value
        .replace(/\n/g, '')
        .split(',')
        .map((domain) => domain.toLowerCase().trim())

      return values as T
    }

    return undefined
  }

  async function start() {
    logger.info('Starting feature flags adapter')

    await refresh()

    refreshInterval = setInterval(async () => {
      await refresh()
    }, refreshIntervalInMs)

    logger.info('Feature flags adapter started', {
      refreshInterval: refreshIntervalInMs / 1000 / 60 + ' minutes'
    })
  }

  async function stop() {
    logger.info('Stopping feature flags adapter')

    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  }

  return {
    [START_COMPONENT]: start,
    [STOP_COMPONENT]: stop,
    isEnabled: (feature: FeatureFlag) => featuresFlagMap.get(feature) ?? false,
    getVariants
  }
}
