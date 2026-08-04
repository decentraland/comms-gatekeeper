import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { validate } from '../../../logic/utils'
import { isValidPresenterIdentity } from './presenter-identity'
import { resolveCastRoom } from './room-resolver'

/**
 * Promotes a participant to the presenter role in a cast room.
 * The room is derived from the Signed Fetch auth metadata (sceneId + realm).
 * The participantIdentity URL param must be a valid Ethereum address or Cast 2.0 streamer identity.
 *
 * @param context - HTTP request context with authentication, components, and URL params
 * @returns 200 on success, 400 for invalid identity, or 401 for unauthorized
 */
export async function promotePresenterHandler(
  context: HandlerContextWithPath<
    'logs' | 'cast' | 'fetch' | 'config' | 'livekit' | 'worlds',
    '/cast/presenters/:participantIdentity'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast, livekit, worlds },
    params
  } = context

  const logger = logs.getLogger('promote-presenter-handler')

  const participantIdentity = params.participantIdentity
  if (!participantIdentity || !isValidPresenterIdentity(participantIdentity)) {
    throw new InvalidRequestError('participantIdentity must be a valid Ethereum address or streamer identity')
  }

  const { identity: callerAddress, sceneId, parcel, realm, isWorld } = await validate(context)
  const { roomId } = await resolveCastRoom(
    { livekit, worlds },
    { sceneId, parcel, realmName: realm.serverName, isWorld }
  )

  await cast.promotePresenter(roomId, participantIdentity, callerAddress)
  logger.info(`Participant ${participantIdentity} promoted to presenter in room ${roomId}`)

  return { status: 200, body: { message: 'Participant promoted to presenter' } }
}
