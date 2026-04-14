import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { validate } from '../../../logic/utils'

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/
const STREAMER_IDENTITY_REGEX = /^stream:[^:]+:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function isValidPresenterIdentity(identity: string): boolean {
  return ETH_ADDRESS_REGEX.test(identity) || STREAMER_IDENTITY_REGEX.test(identity)
}

/**
 * Demotes a presenter back to watcher role in a cast room.
 * The room is derived from the Signed Fetch auth metadata (sceneId + realm).
 * The participantIdentity URL param must be a valid Ethereum address or Cast 2.0 streamer identity.
 *
 * @param context - HTTP request context with authentication, components, and URL params
 * @returns 200 on success, 400 for invalid identity, or 401 for unauthorized
 */
export async function demotePresenterHandler(
  context: HandlerContextWithPath<
    'logs' | 'cast' | 'fetch' | 'config' | 'livekit',
    '/cast/presenters/:participantIdentity'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast, livekit },
    params
  } = context

  const logger = logs.getLogger('demote-presenter-handler')

  const participantIdentity = params.participantIdentity
  if (!participantIdentity || !isValidPresenterIdentity(participantIdentity)) {
    throw new InvalidRequestError('participantIdentity must be a valid Ethereum address or streamer identity')
  }

  const { identity: callerAddress, sceneId, realm, isWorld } = await validate(context)

  if (!sceneId) {
    throw new InvalidRequestError('sceneId is required in authMetadata')
  }

  const roomId = isWorld
    ? livekit.getWorldSceneRoomName(realm.serverName, sceneId)
    : livekit.getSceneRoomName(realm.serverName, sceneId)

  await cast.demotePresenter(roomId, participantIdentity, callerAddress)
  logger.info(`Participant ${participantIdentity} demoted from presenter in room ${roomId}`)

  return { status: 200, body: { message: 'Participant demoted from presenter' } }
}
