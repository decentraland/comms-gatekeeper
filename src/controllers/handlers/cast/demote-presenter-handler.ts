import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'
import { validate } from '../../../logic/utils'

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

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

  await cast.demotePresenter(roomId, participantIdentity, callerAddress)
  logger.info(`Participant ${participantIdentity} demoted from presenter in room ${roomId}`)

  return { status: 200, body: { message: 'Participant demoted from presenter' } }
}
