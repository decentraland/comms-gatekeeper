import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'
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

  // The schema-validator middleware normally rejects a malformed body first; guard here too so
  // the handler doesn't surface a 500 if it is ever wired without that middleware (matches
  // remove-scene-admin-handler).
  let body: WatcherTokenRequestBody
  try {
    body = await request.json()
  } catch {
    throw new InvalidRequestError('Invalid request body')
  }

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
