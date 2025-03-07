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

export function formatUrl(url: string): string {
  if (!url) return '/'
  return url.endsWith('/') ? url : `${url}/`
}

export function isValidAddress(address: string): boolean {
  if (typeof address !== 'string' || !address) return false
  return /^0x[a-fA-F0-9]{40}$/i.test(address)
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

export async function fetchDenyList(): Promise<Set<string>> {
  try {
    const response = await fetch('https://config.decentraland.org/denylist.json')
    if (!response.ok) {
      throw new Error(`Failed to fetch deny list, status: ${response.status}`)
    }
    const data = await response.json()
    if (data.users && Array.isArray(data.users)) {
      return new Set(data.users.map((user: { wallet: string }) => user.wallet.toLocaleLowerCase()))
    } else {
      console.warn('Deny list is missing "users" field or it is not an array.')
      return new Set()
    }
  } catch (error) {
    console.error(`Error fetching deny list: ${(error as Error).message}`)
    return new Set()
  }
}
