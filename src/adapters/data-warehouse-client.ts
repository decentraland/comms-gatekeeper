import { IConfigComponent, IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'

export type Event = {
  context: 'comms_gatekeeper'
  event: 'peer_joined_room' | 'peer_left_room'
  body: {
    env: 'prd' | 'dev'
  } & any
}

export type IDataWarehouseClient = {
  sendEvent: (event: Event) => Promise<void>
}

export type IDwhGenericEventsClientComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  fetch: IFetchComponent
}

export async function createDataWarehouseClient(
  components: Pick<IDwhGenericEventsClientComponents, 'config' | 'fetch' | 'logs'>
): Promise<IDataWarehouseClient> {
  const { config } = components

  const [apiBaseUrl, apiToken] = await Promise.all([config.getString('DWH_API_URL'), config.getString('DWH_TOKEN')])
  if (!apiBaseUrl || !apiToken) {
    return createDummyDataWarehouseClient(components)
  }

  return createDwhGenericEventsClient(components)
}

export async function createDwhGenericEventsClient(
  components: Pick<IDwhGenericEventsClientComponents, 'config' | 'fetch' | 'logs'>
): Promise<IDataWarehouseClient> {
  const { fetch, logs, config } = components
  const logger = logs.getLogger('dwh-generic-events-client')
  logger.info('Creating DWH generic events client')

  const [env, apiBaseUrl, apiToken] = await Promise.all([
    config.requireString('ENV'),
    config.requireString('DWH_API_URL'),
    config.requireString('DWH_TOKEN')
  ])

  async function sendEvent(event: Event): Promise<void> {
    logger.info(`Sending event to DataWarehouse ${event.event}`)

    await fetch.fetch(apiBaseUrl, {
      method: 'POST',
      headers: {
        'x-token': apiToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...event,
        body: {
          ...event.body,
          env
        }
      })
    })
  }

  return {
    sendEvent
  }
}

export async function createDummyDataWarehouseClient(
  components: Pick<IDwhGenericEventsClientComponents, 'logs'>
): Promise<IDataWarehouseClient> {
  const { logs } = components
  const logger = logs.getLogger('dummy-data-warehouse-client')
  logger.info('Creating dummy DataWarehouse client')

  async function sendEvent(event: Event): Promise<void> {
    logger.debug(`Not sending event ${event.event}" to DataWarehouse`)
  }

  return {
    sendEvent
  }
}
