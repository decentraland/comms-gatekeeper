// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { createLocalFetchCompoment, createRunner } from '@well-known-components/test-helpers'
import { main } from '../src/service'
import { TestComponents } from '../src/types'
import { initComponents as originalInitComponents } from '../src/components'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { FeatureFlag, IFeatureFlagsAdapter } from '../src/adapters/feature-flags'
import { createModeratorComponent } from '../src/logic/moderator'

export const TEST_MODERATOR_ACCOUNT = createUnsafeIdentity()

/**
 * Behaves like Jest "describe" function, used to describe a test for a
 * use case, it creates a whole new program and components to run an
 * isolated test.
 *
 * State is persistent within the steps of the test.
 */
export const test = createRunner<TestComponents>({
  main,
  initComponents
})

async function initComponents(): Promise<TestComponents> {
  const components = await originalInitComponents(false)

  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })

  // Override feature flags to return the test moderator account address
  const moderatorFeatureFlags: IFeatureFlagsAdapter = {
    ...components.featureFlags,
    getVariants: async <T>(feature: FeatureFlag): Promise<T | undefined> => {
      if (feature === FeatureFlag.PLATFORM_USER_MODERATORS) {
        return [TEST_MODERATOR_ACCOUNT.address] as T
      }
      return components.featureFlags.getVariants<T>(feature)
    }
  }
  const moderator = await createModeratorComponent({ featureFlags: moderatorFeatureFlags, logs: components.logs, config })

  return {
    ...components,
    config,
    moderator,
    localFetch: await createLocalFetchCompoment(config)
  }
}
