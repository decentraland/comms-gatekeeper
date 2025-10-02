import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError } from '../../../types/errors'

export async function upgradePermissionsHandler(
  context: HandlerContextWithPath<'cast', '/cast/upgrade-permissions'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { cast },
    request
  } = context

  let body: {
    roomId: string
    participantId: string
    walletAddress: string
    signature: string
  }

  try {
    body = await request.json()
  } catch (error) {
    throw new InvalidRequestError('Invalid JSON body')
  }

  const { roomId, participantId, walletAddress, signature } = body

  if (!roomId || !participantId || !walletAddress || !signature) {
    throw new InvalidRequestError('Missing required fields: roomId, participantId, walletAddress, signature')
  }

  // Call cast component to upgrade permissions
  await cast.upgradeParticipantPermissions({
    roomId,
    participantId,
    walletAddress,
    signature
  })

  return {
    status: 200,
    body: {
      success: true,
      permissions: {
        canPublishData: true
      }
    }
  }
}
