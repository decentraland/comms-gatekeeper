import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function muteSpeakerHandler(
  context: HandlerContextWithPath<'logs' | 'voice', '/community-voice-chat/:communityId/users/:userAddress/mute'>
) {
  const {
    components: { logs, voice },
    params,
    request
  } = context
  const logger = logs.getLogger('mute-speaker-handler')

  const { communityId, userAddress } = params

  if (!communityId) {
    throw new InvalidRequestError('The parameter communityId is required')
  }

  if (!userAddress) {
    throw new InvalidRequestError('The parameter userAddress is required')
  }

  const body = await request.json()

  if (typeof body.muted !== 'boolean') {
    throw new InvalidRequestError('The field muted is required and must be a boolean')
  }

  const lowerCaseUserAddress = userAddress.toLowerCase()
  const { muted } = body

  logger.info(`${muted ? 'Muting' : 'Unmuting'} user ${lowerCaseUserAddress} in community ${communityId}`)

  await voice.muteSpeakerInCommunityVoiceChat(communityId, lowerCaseUserAddress, muted)

  const action = muted ? 'muted' : 'unmuted'
  logger.info(`User ${lowerCaseUserAddress} ${action} successfully in community ${communityId}`)

  return {
    status: 200,
    body: {
      message: `User ${action} successfully`
    }
  }
}
