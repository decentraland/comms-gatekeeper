import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
import { UnauthorizedError } from '../../../types/errors'
import { WatcherTokenRequestBody } from './schemas'

export async function watcherTokenHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'cast', '/cast/watcher-token'>,
    'components' | 'request' | 'verification'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast },
    request,
    verification
  } = context

  const logger = logs.getLogger('watcher-token-handler')

  // The route is guarded by signed-fetch auth so we can enforce scene bans on the viewer.
  if (!verification?.auth) {
    throw new UnauthorizedError('Authentication required')
  }
  const watcherAddress = verification.auth.toLowerCase()

  const body: WatcherTokenRequestBody = await request.json()

  const credentials = await cast.generateWatcherCredentialsByLocation(
    body.location,
    body.identity,
    watcherAddress,
    body.parcel
  )

  logger.info(`Watcher credentials generated for location ${body.location}`)

  return {
    status: 200,
    body: credentials
  }
}
