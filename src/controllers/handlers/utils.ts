import { DecentralandSignatureData, verify } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, UnauthorizedError } from '../../types'
import * as Joi from 'joi'

export type AuthData = { identity: string; realmName: string; sceneId?: string }

export async function validate<T extends string>(
  context: HandlerContextWithPath<'fetch' | 'config', T>
): Promise<AuthData> {
  const { config, fetch } = context.components
  const baseUrl = (await config.getString('HTTP_BASE_URL')) || `${context.url.protocol}//${context.url.host}`
  const path = new URL(baseUrl + context.url.pathname)
  let verification: DecentralandSignatureData<AuthData>
  try {
    verification = await verify(context.request.method, path.pathname, context.request.headers.raw(), {
      fetcher: fetch
    })
  } catch (e) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request')
  }

  const { realmName, sceneId } = verification.authMetadata
  if (!realmName) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request, no realmName')
  }

  const identity = verification.auth

  return {
    identity,
    realmName,
    sceneId
  }
}

export function validateSceneAdminPayload(payload: any) {
  const schema = Joi.object({
    entity_id: Joi.string()
      .pattern(/^bafkrei[a-zA-Z0-9]+$/, 'start with "bafkrei" followed by alphanumeric characters')
      .required(),
    admin: Joi.string()
      .pattern(/^0x[a-fA-F0-9]{40}$/i, 'address must be a valid Ethereum address')
      .lowercase()
      .required()
  })

  const result = schema.validate(payload)

  if (result.error) {
    return {
      success: false,
      error: result.error.message
    }
  }

  return {
    success: true,
    value: result.value
  }
}
