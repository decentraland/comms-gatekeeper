import { resolve } from 'path'
import { createAnalyticsComponent } from '@dcl/analytics-component'
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
import { createWorldsComponent } from './adapters/worlds'
import { createPlacesComponent } from './adapters/places'
import { createLandsComponent } from './adapters/lands'
import { createSceneManagerComponent } from './adapters/scene-manager'
import { createNamesComponent } from './adapters/names'
import { createSocialComponent } from './adapters/social'
import { createPlaceChecker } from './adapters/places-checker'
import { createStreamingTTLChecker } from './adapters/streaming-ttl-checker'
import { createStreamingKeyTTLChecker } from './adapters/streaming-key-ttl-checker'
import { createSnsComponent } from './adapters/sns'
import { createNotificationsComponent } from './adapters/notifications'
import { createSceneAdminsComponent } from './adapters/scene-admins'
import { createVoiceDBComponent } from './adapters/db/voice-db'
import { createVoiceComponent } from './logic/voice/voice'
import { createCronJobComponent } from './logic/cron-job'
import { AnalyticsEventPayload } from './types/analytics'
import { createLandLeaseComponent } from './adapters/land-lease'

// Initialize all the components of the app
export async function initComponents(isProduction: boolean = true): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const everyMinuteExpression = '* * * * *'
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
  const social = await createSocialComponent({ config, logs, fetch: tracedFetch })
  const cachedFetch = await cachedFetchComponent({ fetch: tracedFetch, logs })
  const worlds = await createWorldsComponent({ config, logs, cachedFetch })
  const places = await createPlacesComponent({ config, logs, cachedFetch, fetch: tracedFetch })
  const lands = await createLandsComponent({ config, logs, cachedFetch })
  const names = await createNamesComponent({ config, logs, fetch: tracedFetch })
  const landLease = await createLandLeaseComponent({ fetch: tracedFetch, logs })
  const sceneManager = await createSceneManagerComponent({ worlds, lands, sceneAdminManager, landLease })
  const analytics = await createAnalyticsComponent<AnalyticsEventPayload>({ config, logs, fetcher: tracedFetch })

  const sceneStreamAccessManager = await createSceneStreamAccessManagerComponent({ database, logs })

  const sceneAdmins = await createSceneAdminsComponent({ worlds, lands, sceneAdminManager })

  const notifications = await createNotificationsComponent({ config, logs, fetch: tracedFetch, sceneAdmins })

  const placesChecker = await createPlaceChecker({
    logs,
    sceneAdminManager,
    sceneStreamAccessManager,
    places,
    notifications
  })

  const streamingTTLChecker = await createStreamingTTLChecker({
    logs,
    sceneStreamAccessManager,
    livekit,
    places,
    notifications
  })

  const streamingKeyTTLChecker = await createStreamingKeyTTLChecker({
    logs,
    sceneStreamAccessManager,
    livekit,
    places,
    notifications
  })

  const publisher = await createSnsComponent({ config })

  // Voice components
  const voiceDB = await createVoiceDBComponent({ database, logs, config })
  const voice = createVoiceComponent({ voiceDB, logs, livekit, analytics })
  const voiceChatExpirationJob = await createCronJobComponent(
    { logs },
    voice.expirePrivateVoiceChats,
    everyMinuteExpression,
    { startOnInit: isProduction, waitForCompletion: true }
  )
  const communityVoiceChatExpirationJob = await createCronJobComponent(
    { logs },
    voice.expireCommunityVoiceChats,
    everyMinuteExpression,
    { startOnInit: isProduction, waitForCompletion: true }
  )

  return {
    analytics,
    blockList,
    config,
    logs,
    server,
    tracer,
    statusChecks,
    fetch: tracedFetch,
    voiceChatExpirationJob,
    communityVoiceChatExpirationJob,
    metrics,
    cachedFetch,
    worlds,
    places,
    lands,
    names,
    sceneManager,
    social,
    livekit,
    database,
    voiceDB,
    voice,
    sceneAdminManager,
    sceneStreamAccessManager,
    placesChecker,
    streamingTTLChecker,
    streamingKeyTTLChecker,
    publisher,
    sceneAdmins,
    notifications,
    landLease
  }
}
