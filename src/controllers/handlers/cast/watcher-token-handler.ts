import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
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

  // Auth is enforced by the authWatcher route middleware (optional: false rejects unidentified
  // requests), so verification is guaranteed here. Scene bans are enforced against this wallet
  // inside the cast component. Body shape is enforced by the WatcherTokenRequestSchema validator.
  const watcherAddress = verification!.auth.toLowerCase()

  const body: WatcherTokenRequestBody = await request.json()

  const credentials = await cast.generateWatcherCredentialsByLocation(
    body.location,
    body.identity,
    watcherAddress,
    body.parcel,
    verification!.authMetadata?.deviceIdentifier
  )

  logger.info(`Watcher credentials generated for location ${body.location}`)

  return {
    status: 200,
    body: credentials
  }
}
