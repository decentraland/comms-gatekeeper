import { DecentralandSignatureData, verify } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, UnauthorizedError } from '../../types'

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
