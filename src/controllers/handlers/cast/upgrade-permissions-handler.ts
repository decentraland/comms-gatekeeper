import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'
import { InvalidRequestError, UnauthorizedError } from '../../../types/errors'

export async function upgradePermissionsHandler(
  context: HandlerContextWithPath<'logs' | 'cast', '/cast/upgrade-permissions'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { logs, cast },
    request
  } = context

  const logger = logs.getLogger('upgrade-permissions-handler')

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

  try {
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
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof InvalidRequestError) {
      throw error
    }

    logger.error(`Failed to upgrade permissions: ${(error as Error).message}`)
    throw new InvalidRequestError('Failed to upgrade participant permissions')
  }
}
