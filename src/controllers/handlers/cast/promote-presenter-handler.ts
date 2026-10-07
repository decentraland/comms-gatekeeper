import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { validate, isValidPresenterIdentity } from '../../../logic/utils'

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

  if (!sceneId) {
    throw new InvalidRequestError('sceneId is required in authMetadata')
  }

  const resolvedSceneId = isWorld ? await worlds.resolveWorldSceneId(realm.serverName, sceneId, parcel) : sceneId
  const roomId = isWorld
    ? livekit.getWorldSceneRoomName(realm.serverName, resolvedSceneId)
    : livekit.getSceneRoomName(realm.serverName, sceneId)

  await cast.promotePresenter(roomId, participantIdentity, callerAddress)
  logger.info(`Participant ${participantIdentity} promoted to presenter in room ${roomId}`)

  return { status: 200, body: { message: 'Participant promoted to presenter' } }
}
