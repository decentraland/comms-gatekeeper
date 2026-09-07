// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { createLocalFetchComponent, createRunner, defaultServerConfig } from '@dcl/test-helpers'
import { main } from '../src/service'
import { TestComponents } from '../src/types'
import { initComponents as originalInitComponents } from '../src/components'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { ApplicationName, IFeaturesComponent } from '@dcl/features-component'
import { createModeratorComponent, PLATFORM_USER_MODERATORS_FLAG } from '../src/logic/moderator'

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
  // Every program here binds a real HTTP port, and `.env.default` pins `HTTP_SERVER_PORT=3000` for
  // all of them. With more than one jest worker, two programs race for that port: the loser's
  // `listen` fails with EADDRINUSE, `Lifecycle.run` calls `process.exit(1)`, and jest reports
  // "Jest worker encountered 4 child process exceptions" against whichever suite that worker
  // happened to be running — a different one every time.
  //
  // `defaultServerConfig()` hands out a port seeded from `JEST_WORKER_ID` and incremented per
  // program. It has to reach `process.env` before `initComponents`, because the server component
  // reads the port from the config that builds there, and the env-config provider skips a
  // `.env.default` entry whose key is already present in `process.env`.
  Object.assign(process.env, defaultServerConfig())

  const components = await originalInitComponents(false)

  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })

  // Override the moderators feature flag variant to return the test moderator account address
  const moderatorFeatures: IFeaturesComponent = {
    ...components.features,
    getFeatureVariant: async (app, feature) => {
      if (app === ApplicationName.DAPPS && feature === PLATFORM_USER_MODERATORS_FLAG) {
        return {
          name: PLATFORM_USER_MODERATORS_FLAG,
          enabled: true,
          payload: { type: 'string', value: TEST_MODERATOR_ACCOUNT.address }
        }
      }
      return components.features.getFeatureVariant(app, feature)
    }
  }
  const moderator = await createModeratorComponent({ features: moderatorFeatures, logs: components.logs, config })

  return {
    ...components,
    config,
    moderator,
    localFetch: await createLocalFetchComponent(config)
  }
}
