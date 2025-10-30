import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { WatcherTokenRequestBody } from './schemas'

export async function watcherTokenHandler(
  context: HandlerContextWithPath<'logs' | 'cast', '/cast/watcher-token'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast },
    request
  } = context

  const logger = logs.getLogger('watcher-token-handler')

  const body: WatcherTokenRequestBody = await request.json()

  // Call cast component to generate watcher credentials using location (parcel or world)
  const credentials = await cast.generateWatcherCredentialsByLocation(body.location, body.identity)

  logger.info(`Watcher credentials generated for location ${body.location}`)

  return {
    status: 200,
    body: credentials
  }
}
