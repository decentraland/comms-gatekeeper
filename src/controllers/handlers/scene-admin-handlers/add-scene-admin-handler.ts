import { InvalidRequestError } from '../../../types'
import { HandlerContextWithPath } from '../../../types'
import { validateSceneAdminPayload } from '../utils'
import { Authenticator } from '@dcl/crypto'

export async function addSceneAdminHandler(
  ctx: Pick<
    HandlerContextWithPath<'sceneAdminManager' | 'logs' | 'config', '/scene-admin'>,
    'components' | 'request' | 'verification'
  >
) {
  const {
    components: { logs, sceneAdminManager, config },
    request,
    verification
  } = ctx

  const logger = logs.getLogger('add-scene-admin-handler')

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const authAddress = verification.auth
  const payload = await request.clone().json()

  const validationResult = validateSceneAdminPayload(payload)
  if (!validationResult.success) {
    logger.warn(`Invalid scene admin payload: ${validationResult.error}`, payload)
    throw new InvalidRequestError(`Invalid payload: ${validationResult.error}`)
  }

  const { entity_id: entityId, admin } = validationResult.value

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

    await sceneAdminManager.addAdmin({
      entity_id: entityId,
      admin: admin.toLowerCase(),
      owner: data.authChain ? Authenticator.ownerAddress(data.authChain) : authAddress.toLowerCase(),
      added_by: authAddress.toLowerCase()
    })

    return {
      status: 204
    }
  } catch (error) {
    logger.error(`Error adding scene admin: ${error}`)
    throw new InvalidRequestError('Failed to add scene admin')
  }
}
