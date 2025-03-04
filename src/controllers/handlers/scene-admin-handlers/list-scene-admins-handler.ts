import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath, InvalidRequestError } from '../../../types'
import * as Joi from 'joi'

const schema = Joi.object({
  entity_id: Joi.string().optional(),
  admin: Joi.string().optional().lowercase()
})

export async function listSceneAdminsHandler(
  ctx: Pick<HandlerContextWithPath<'sceneAdminManager' | 'logs', '/scene-admin'>, 'components' | 'url'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { sceneAdminManager, logs },
    url
  } = ctx

  const logger = logs.getLogger('list-scene-admins-handler')
  const filters = {
    entity_id: url.searchParams.get('entity_id') || undefined,
    admin: url.searchParams.get('admin') || undefined
  }

  const { error, value } = schema.validate(filters)
  if (error) {
    logger.warn(`Invalid filters: ${error.message} (${JSON.stringify(filters)})`)
    throw new InvalidRequestError(`Invalid filters: ${error.message}`)
  }

  try {
    const admins = await sceneAdminManager.listActiveAdmins(value)
    return {
      status: 200,
      body: admins
    }
  } catch (error) {
    logger.error(`Error listing scene admins: ${error}`)
    throw new InvalidRequestError('Error listing scene admins')
  }
}
