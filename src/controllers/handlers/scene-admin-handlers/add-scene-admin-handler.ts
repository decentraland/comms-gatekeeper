import { InvalidRequestError } from '../../../types'
import { HandlerContextWithPath } from '../../../types'
import { validateSceneAdminPayload, fetchSceneAudit } from '../utils'
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

    const sceneWithAuthChain = await fetchSceneAudit(catalystContentUrl, entityId)

    await sceneAdminManager.addAdmin({
      entity_id: entityId,
      admin: admin.toLowerCase(),
      owner: sceneWithAuthChain.authChain
        ? Authenticator.ownerAddress(sceneWithAuthChain.authChain)
        : authAddress.toLowerCase(),
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
