import { resolve } from 'path'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createServerComponent, createStatusCheckComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent, instrumentHttpServerWithMetrics } from '@well-known-components/metrics'
import { createTracerComponent } from '@well-known-components/tracer-component'
import { instrumentHttpServerWithRequestLogger } from '@well-known-components/http-requests-logger-component'
import { createHttpTracerComponent } from '@well-known-components/http-tracer-component'
import { createPgComponent } from '@well-known-components/pg-component'
import { AppComponents, GlobalContext } from './types'
import { metricDeclarations } from './metrics'
import { createLivekitComponent } from './adapters/livekit'
import { createSceneAdminManagerComponent } from './adapters/scene-admin-manager'
import { createSceneStreamAccessManagerComponent } from './adapters/scene-stream-access-manager'
import { createTracedFetchComponent } from './adapters/traced-fetch'
import { createBlockListComponent } from './adapters/blocklist'
import { cachedFetchComponent } from './adapters/fetch'
import { createWorldComponent } from './adapters/world'
import { createPlacesComponent } from './adapters/places'
import { createLandComponent } from './adapters/land'
import { createSceneManagerComponent } from './adapters/scene-manager'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const tracer = createTracerComponent()
  const logs = await createLogComponent({ metrics, tracer })
  const server = await createServerComponent<GlobalContext>(
    { config, logs },
    {
      cors: {
        maxAge: 36000
      }
    }
  )
  const statusChecks = await createStatusCheckComponent({ server, config })
  const tracedFetch = createTracedFetchComponent({ tracer })
  const blockList = await createBlockListComponent({ config, fetch: tracedFetch })

  createHttpTracerComponent({ server, tracer })
  instrumentHttpServerWithRequestLogger({ server, logger: logs })
  await instrumentHttpServerWithMetrics({ metrics, server, config })

  const livekit = await createLivekitComponent({ config, logs })

  let databaseUrl: string | undefined = await config.getString('PG_COMPONENT_PSQL_CONNECTION_STRING')
  if (!databaseUrl) {
    const dbUser = await config.requireString('PG_COMPONENT_PSQL_USER')
    const dbDatabaseName = await config.requireString('PG_COMPONENT_PSQL_DATABASE')
    const dbPort = await config.requireString('PG_COMPONENT_PSQL_PORT')
    const dbHost = await config.requireString('PG_COMPONENT_PSQL_HOST')
    const dbPassword = await config.requireString('PG_COMPONENT_PSQL_PASSWORD')
    databaseUrl = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}`
  }

  const database = await createPgComponent(
    { logs, config, metrics },
    {
      migration: {
        databaseUrl,
        dir: resolve(__dirname, 'migrations'),
        migrationsTable: 'pgmigrations',
        ignorePattern: '.*\\.DS_Store|.*\\.map',
        direction: 'up'
      }
    }
  )

  const sceneAdminManager = await createSceneAdminManagerComponent({ database, logs })

  const cachedFetch = await cachedFetchComponent({ fetch: tracedFetch, logs })
  const world = await createWorldComponent({ config, logs, cachedFetch })
  const places = await createPlacesComponent({ config, logs, cachedFetch })
  const land = await createLandComponent({ config, logs, cachedFetch })
  const sceneManager = await createSceneManagerComponent({ world, land, sceneAdminManager })

  const sceneStreamAccessManager = await createSceneStreamAccessManagerComponent({ database, logs })

  return {
    blockList,
    config,
    logs,
    server,
    tracer,
    statusChecks,
    fetch: tracedFetch,
    metrics,
    cachedFetch,
    world,
    places,
    land,
    sceneManager,
    livekit,
    database,
    sceneAdminManager,
    sceneStreamAccessManager
  }
}
