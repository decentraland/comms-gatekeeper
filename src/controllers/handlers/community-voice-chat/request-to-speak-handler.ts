import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function requestToSpeakHandler(
  context: HandlerContextWithPath<
    'logs' | 'voice',
    '/community-voice-chat/:communityId/users/:userAddress/speak-request'
  >
) {
  const {
    components: { logs, voice },
    params
  } = context
  const logger = logs.getLogger('request-to-speak-handler')

  const { communityId, userAddress } = params

  if (!communityId) {
    throw new InvalidRequestError('The parameter communityId is required')
  }

  if (!userAddress) {
    throw new InvalidRequestError('The parameter userAddress is required')
  }

  const lowerCaseUserAddress = userAddress.toLowerCase()

  logger.info(`User ${lowerCaseUserAddress} requesting to speak in community ${communityId}`)

  await voice.requestToSpeakInCommunity(communityId, lowerCaseUserAddress)

  return {
    status: 200,
    body: {
      message: 'Request to speak sent successfully'
    }
  }
}
