import { DecentralandSignatureData, verify } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, UnauthorizedError, AuthData } from '../../types'

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

  const { realmName, sceneId, parcel, hostname } = verification.authMetadata
  if (!realmName) {
    throw new UnauthorizedError('Access denied, invalid signed-fetch request, no realmName')
  }

  const identity = verification.auth

  return {
    identity,
    realmName,
    sceneId,
    parcel,
    hostname
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

export async function fetchBlacklistedWallets(blackListJson: string): Promise<Set<string>> {
  const response = await fetch(blackListJson)
  if (!response.ok) {
    throw new Error(`Failed to fetch deny list, status: ${response.status}`)
  }
  const data = await response.json()
  if (data.users && Array.isArray(data.users)) {
    return new Set(data.users.map((user: { wallet: string }) => user.wallet.toLocaleLowerCase()))
  }
  return new Set()
}
