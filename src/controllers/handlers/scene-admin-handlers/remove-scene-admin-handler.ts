import { HandlerContextWithPath, InvalidRequestError } from '../../../types'
import { Authenticator } from '@dcl/crypto'

export async function removeSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<'sceneAdminManager' | 'logs' | 'config', '/scene-admin/:entityId/:admin'>,
    'components' | 'url' | 'params' | 'verification'
  >
) {
  const {
    components: { logs, sceneAdminManager, config },
    params: { entityId, admin },
    verification
  } = ctx

  const logger = logs.getLogger('remove-scene-admin-handler')

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }
  const authAddress = verification.auth
  const isAdminUser = await sceneAdminManager.isAdmin(entityId, authAddress)

  try {
    const [catalystContentUrl] = await Promise.all([config.requireString('CATALYST_CONTENT_URL')])

    if (typeof fetch !== 'function') {
      throw new Error('Fetch is not available')
    }

    const response = await fetch(`${catalystContentUrl}/audit/scene/${entityId}`)

    if (!response) {
      throw new Error('No response received from server')
    }

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`)
    }

    const data = await response.json()

    if (!data || !data.authChain) {
      throw new Error('Invalid response format: missing authChain')
    }

    const owner = Authenticator.ownerAddress(data.authChain)

    if (admin.toLowerCase() === owner.toLowerCase()) {
      logger.warn(`Attempt to remove owner ${admin} from entity ${entityId} by ${authAddress}`)
      throw new InvalidRequestError('Cannot remove the owner of the scene')
    }

    const isAuthOwner = authAddress.toLowerCase() === owner.toLowerCase()
    if (!isAdminUser && !isAuthOwner) {
      logger.warn(`User ${authAddress} is not authorized to remove admins for entity ${entityId}`)
      throw new InvalidRequestError('Only scene admins or the owner can remove admins')
    }

    await sceneAdminManager.removeAdmin(entityId, admin)
    return {
      status: 204
    }
  } catch (error) {
    logger.error(`Error in scene admin operation: ${error}`)
    throw new InvalidRequestError('Failed to complete the operation')
  }
}
