import { DecentralandSignatureData, verify } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, AuthData } from '../types'
import { UnauthorizedError } from '../types/errors'

export async function oldValidate<T extends string>(
  context: HandlerContextWithPath<'fetch' | 'config', T>
): Promise<Omit<AuthData, 'realm'>> {
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

  const { sceneId, parcel, realmName } = verification.authMetadata
  if (!realmName) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request, no realm')
  }

  const identity = verification.auth

  return {
    identity,
    sceneId,
    parcel,
    realmName
  }
}

export async function validate<T extends string>(
  context: HandlerContextWithPath<'fetch' | 'config', T>
): Promise<Omit<AuthData, 'realmName'>> {
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

  const { realm, sceneId, parcel } = verification.authMetadata
  if (!realm) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request, no realm')
  }

  const identity = verification.auth

  return {
    identity,
    sceneId,
    parcel,
    realm
  }
}

export function ensureSlashAtTheEnd(url: string): string | undefined {
  if (!url) return undefined
  return url.endsWith('/') ? url : `${url}/`
}

export function validateFilters(filters: { admin?: string }): {
  valid: boolean
  error?: string
  value: { admin?: string }
} {
  if (filters.admin !== undefined && typeof filters.admin !== 'string') {
    return {
      valid: false,
      error: 'admin must be a string',
      value: {}
    }
  }

  return {
    valid: true,
    value: {
      admin: filters.admin ? filters.admin.toLowerCase() : undefined
    }
  }
}
