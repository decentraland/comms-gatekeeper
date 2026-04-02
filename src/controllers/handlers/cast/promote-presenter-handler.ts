import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { validate } from '../../../logic/utils'

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

/**
 * Promotes a participant to the presenter role in a cast room.
 * The room is derived from the Signed Fetch auth metadata (sceneId + realm).
 * The participantIdentity URL param must be a valid Ethereum address.
 *
 * @param context - HTTP request context with authentication, components, and URL params
 * @returns 200 on success, 400 for invalid address, or 401 for unauthorized
 */
export async function promotePresenterHandler(
  context: HandlerContextWithPath<
    'logs' | 'cast' | 'fetch' | 'config' | 'livekit',
    '/cast/presenters/:participantIdentity'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast, livekit },
    params
  } = context

  const logger = logs.getLogger('promote-presenter-handler')

  const participantIdentity = params.participantIdentity
  if (!participantIdentity || !ETH_ADDRESS_REGEX.test(participantIdentity)) {
    throw new InvalidRequestError('participantIdentity must be a valid Ethereum address')
  }

  const { identity: callerAddress, sceneId, realm, isWorld } = await validate(context)

  if (!sceneId) {
    throw new InvalidRequestError('sceneId is required in authMetadata')
  }

  const roomId = isWorld
    ? livekit.getWorldSceneRoomName(realm.serverName, sceneId)
    : livekit.getSceneRoomName(realm.serverName, sceneId)

  await cast.promotePresenter(roomId, participantIdentity, callerAddress)
  logger.info(`Participant ${participantIdentity} promoted to presenter in room ${roomId}`)

  return { status: 200, body: { message: 'Participant promoted to presenter' } }
}
