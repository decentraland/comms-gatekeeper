import { AuthIdentity, Authenticator } from '@dcl/crypto'
import { AUTH_CHAIN_HEADER_PREFIX, AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER } from '@dcl/platform-crypto-middleware'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'

export type Identity = AuthIdentity

export async function createTestIdentity(): Promise<Identity> {
  const ephemeralIdentity = createUnsafeIdentity()
  const realAccount = createUnsafeIdentity()

  return Authenticator.initializeAuthChain(realAccount.address, ephemeralIdentity, 10, async (message) =>
    Authenticator.createSignature(realAccount, message)
  )
}

export async function createTestIdentityFromAccount(
  realAccount: ReturnType<typeof createUnsafeIdentity>
): Promise<Identity> {
  const ephemeralIdentity = createUnsafeIdentity()

  return Authenticator.initializeAuthChain(realAccount.address, ephemeralIdentity, 10, async (message) =>
    Authenticator.createSignature(realAccount, message)
  )
}

export function makeAuthenticatedRequest(components: { localFetch: any }) {
  return async function (identity: Identity, path: string, method: string = 'GET', body?: any) {
    const timestamp = Date.now()
    const metadata = JSON.stringify({})
    const payloadParts = [method.toLowerCase(), path.toLowerCase(), timestamp.toString(), metadata]
    const payloadToSign = payloadParts.join(':').toLowerCase()
    const chain = Authenticator.signPayload(identity, payloadToSign)

    const headers: Record<string, string> = {}
    chain.forEach((link, index) => {
      headers[`${AUTH_CHAIN_HEADER_PREFIX}${index}`] = JSON.stringify(link)
    })
    headers[AUTH_TIMESTAMP_HEADER] = timestamp.toString()
    headers[AUTH_METADATA_HEADER] = metadata

    const options: any = {
      method,
      headers: {
        ...headers,
        ...(body ? { 'content-type': 'application/json' } : {})
      }
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    return components.localFetch.fetch(path, options)
  }
}
