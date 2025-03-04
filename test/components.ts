// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { createRunner, createLocalFetchCompoment } from '@well-known-components/test-helpers'
import { main } from '../src/service'
import { TestComponents } from '../src/types'
import { initComponents as originalInitComponents } from '../src/components'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'

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
  const components = await originalInitComponents()

  const config = await createDotEnvConfigComponent(
    { path: ['.env.default', '.env'] },
    {
      PG_COMPONENT_PSQL_CONNECTION_STRING: 'postgresql://usr:pwd@localhost:5432/comms_gatekeeper_test',
      HTTP_SERVER_PORT: '3001',
      HTTP_SERVER_HOST: '127.0.0.1'
    }
  )

  return {
    ...components,
    config,
    localFetch: await createLocalFetchCompoment(config)
  }
}
