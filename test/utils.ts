import { AuthChain, AuthIdentity, AuthLinkType, Authenticator, IdentityType } from '@dcl/crypto'
import { AUTH_CHAIN_HEADER_PREFIX, AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER } from '@dcl/crypto-middleware'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { getAuthHeaders } from '@dcl/test-helpers'
import { createKeyedQueueComponent, IKeyedQueueComponent } from '../src/adapters/keyed-queue'
import { createConfigMockedComponent } from './mocks/config-mock'
import { createLoggerMockedComponent } from './mocks/logger-mock'

/**
 * Builds a fresh identity for each test run: a new account delegating to a new ephemeral key.
 * The delegation outlives specs that move `Date.now()` forward.
 */
export function createTestIdentity(): AuthIdentity {
  const account = createUnsafeIdentity()
  const ephemeralIdentity = createUnsafeIdentity()
  const expiration = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
  const ephemeralMessage = Authenticator.getEphemeralMessage(ephemeralIdentity.address, expiration)

  return {
    ephemeralIdentity,
    expiration,
    authChain: [
      { type: AuthLinkType.SIGNER, payload: account.address.toLowerCase(), signature: '' },
      {
        type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
        payload: ephemeralMessage,
        signature: Authenticator.createSignature(account, ephemeralMessage)
      }
    ]
  }
}

export const owner: AuthIdentity = createTestIdentity()

export const nonOwner: AuthIdentity = createTestIdentity()

export const admin: AuthIdentity = createTestIdentity()

/**
 * The current payload format (@dcl/crypto-middleware 6) is signed by `@dcl/test-helpers`, so the
 * one definition of it stays in step with the middleware that verifies it. Re-exported here so
 * call sites keep importing it from `test/utils`.
 */
export { getAuthHeaders }

/**
 * Signs the pre-6.0.0 payload, which folded the whole joined string. Explorer clients still
 * produce this until unity, godot and bevy ship the new format; delete alongside
 * `canonicalMetadataKeys` in src/logic/utils.ts once they have.
 *
 * Deliberately kept local rather than taken from `@dcl/test-helpers`: the shared package only
 * signs the current format, so there is nothing there to import, and this is the only thing
 * covering the legacy-compatibility window.
 */
export function getLegacyAuthHeaders(
  method: string,
  path: string,
  metadata: Record<string, any>,
  chainProvider: (payload: string) => AuthChain,
  deliveredMetadata?: string
) {
  const headers: Record<string, string> = {}
  const timestamp = Date.now()
  const metadataJSON = JSON.stringify(metadata)
  const payloadToSign = [method, path, timestamp.toString(), metadataJSON].join(':').toLowerCase()

  chainProvider(payloadToSign).forEach((link, index) => {
    headers[`${AUTH_CHAIN_HEADER_PREFIX}${index}`] = JSON.stringify(link)
  })

  headers[AUTH_TIMESTAMP_HEADER] = timestamp.toString()
  // Delivered separately so a test can re-case the metadata after signing, which the legacy
  // payload cannot distinguish.
  headers[AUTH_METADATA_HEADER] = deliveredMetadata ?? metadataJSON

  return headers
}

export async function makeRequest(fetch: any, path: string, options: any = {}, identity = admin) {
  const url = new URL(path, 'http://127.0.0.1:3002')

  const { metadata, headers, ...otherOptions } = options

  let authIdentity = identity
  if (typeof identity === 'string') {
    authIdentity = {
      ...admin,
      authChain: [
        {
          type: AuthLinkType.SIGNER,
          payload: identity,
          signature: ''
        },
        ...admin.authChain.slice(1)
      ]
    }
  }
  const fetchOptions = {
    ...otherOptions,
    headers: {
      ...headers,
      ...getAuthHeaders(
        options.method || 'GET',
        url.pathname,
        {
          signer: 'decentraland-kernel-scene',
          ...metadata
        },
        (payload) => Authenticator.signPayload(authIdentity, payload)
      ),
      // Add content-type header for requests with body
      ...(otherOptions.body && { 'content-type': 'application/json' })
    }
  }

  return fetch.fetch(path, fetchOptions)
}

export async function getIdentity(): Promise<AuthIdentity> {
  const ephemeralIdentity = createUnsafeIdentity()
  const realAccount = createUnsafeIdentity()

  const authChain = await Authenticator.initializeAuthChain(
    realAccount.address,
    ephemeralIdentity,
    10,
    async (message) => {
      return Authenticator.createSignature(realAccount, message)
    }
  )

  return authChain
}

export async function getIdentityForAccount(account: ReturnType<typeof createUnsafeIdentity>): Promise<AuthIdentity> {
  const ephemeralIdentity = createUnsafeIdentity()

  return Authenticator.initializeAuthChain(account.address, ephemeralIdentity, 10, async (message) =>
    Authenticator.createSignature(account, message)
  )
}

/**
 * Lets a test hold a mocked async call open and resolve it on its own schedule.
 */
export function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

/**
 * Yields to the macrotask queue, letting every already-queued promise chain settle. Needed
 * when the code under test kicks off detached async work (`void somePromise`) that nothing
 * in the test naturally awaits.
 */
export function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/**
 * A real keyed queue over mocked config and logs, for specs whose subject depends on genuine
 * per-key serialization. Drain timeout left at its default.
 */
export function createKeyedQueueTestComponent(): Promise<IKeyedQueueComponent> {
  return createKeyedQueueComponent({
    config: createConfigMockedComponent({ getNumber: jest.fn().mockResolvedValue(undefined) }),
    logs: createLoggerMockedComponent({})
  })
}
