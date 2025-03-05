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

/**
 * Fetches scene audit data from the Catalyst server
 * @param catalystContentUrl Base URL for the Catalyst content server
 * @param entityId ID of the scene entity to fetch
 * @returns The scene audit data with authChain
 * @throws Error if the fetch fails or response format is invalid
 */
export async function fetchSceneAudit(catalystContentUrl: string, entityId: string) {
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

  const sceneWithAuthChain = await response.json()

  if (!sceneWithAuthChain || !sceneWithAuthChain.authChain) {
    throw new Error('Invalid response format: missing authChain')
  }

  return sceneWithAuthChain
}
