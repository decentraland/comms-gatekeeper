import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createServerComponent, createStatusCheckComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent, instrumentHttpServerWithMetrics } from '@well-known-components/metrics'
import { AppComponents, GlobalContext } from './types'
import { metricDeclarations } from './metrics'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createSceneFetcherComponent } from './adapters/scene-fetcher'
import { createLivekitComponent } from './adapters/livekit'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const logs = await createLogComponent({ metrics })
  const server = await createServerComponent<GlobalContext>(
    { config, logs },
    {
      cors: {
        maxAge: 36000
      }
    }
  )
  const statusChecks = await createStatusCheckComponent({ server, config })
  const fetch = createFetchComponent()

  await instrumentHttpServerWithMetrics({ metrics, server, config })

  const sceneFetcher = await createSceneFetcherComponent({ config, logs, fetch })
  const livekit = await createLivekitComponent({ config, logs })

  return {
    config,
    logs,
    server,
    statusChecks,
    fetch,
    metrics,
    sceneFetcher,
    livekit
  }
}
