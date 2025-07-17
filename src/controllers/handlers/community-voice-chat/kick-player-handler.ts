import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function kickPlayerHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/:communityId/users/:userAddress'>
) {
  const {
    components: { logs, voice },
    params
  } = context
  const logger = logs.getLogger('kick-player-handler')

  const { communityId, userAddress } = params

  if (!communityId) {
    throw new InvalidRequestError('The parameter communityId is required')
  }

  if (!userAddress) {
    throw new InvalidRequestError('The parameter userAddress is required')
  }

  const lowerCaseUserAddress = userAddress.toLowerCase()

  logger.info(`Kicking user ${lowerCaseUserAddress} from community ${communityId}`)

  await voice.kickPlayerFromCommunity(communityId, lowerCaseUserAddress)

  return {
    status: 200,
    body: {
      message: 'User kicked from voice chat successfully'
    }
  }
}
