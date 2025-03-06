// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { createLocalFetchCompoment, createRunner } from '@well-known-components/test-helpers'
import { main } from '../src/service'
import { TestComponents } from '../src/types'
import { initComponents as originalInitComponents } from '../src/components'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import * as nodeFetch from 'node-fetch'
import { createSceneAdminManagerComponent } from '../src/adapters/scene-admin-manager'

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

  const { logs, database } = components

  const config = await createDotEnvConfigComponent(
    { path: ['.env.default', '.env'] },
    {
      PG_COMPONENT_PSQL_CONNECTION_STRING: 'postgresql://usr:pwd@localhost:5432/comms_gatekeeper_test'
    }
  )

  const fetch = {
    async fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
      return nodeFetch.default(url, init).then(async (response: nodeFetch.Response) => {
        if (response.ok) {
          // response.status >= 200 && response.status < 300
          return response
        }

        throw new Error(await response.text())
      })
    }
  }

  const sceneAdminManager = await createSceneAdminManagerComponent({ database, logs })

  return {
    ...components,
    config,
    fetch,
    sceneAdminManager,
    localFetch: await createLocalFetchCompoment(config)
  }
}
