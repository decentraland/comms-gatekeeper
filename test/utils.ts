import { AuthChain, AuthIdentity, AuthLinkType, Authenticator, IdentityType } from '@dcl/crypto'
import { AUTH_CHAIN_HEADER_PREFIX, AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER } from '@dcl/platform-crypto-middleware'
import { IFetchComponent } from '@well-known-components/interfaces'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'

export const owner: AuthIdentity = {
  ephemeralIdentity: {
    address: '0xB31A6030Cd90eb9776eBE6e6A80F152C10A86ee2',
    privateKey: '0xa78301e605a76dda31d80a69ee8175537b197e0b6c1f7dbc60a759a57395b52b',
    publicKey:
      '0x0427d816be14fd58641a30fa205aebb679d525a5747bc2386a46203ea0f48fa39cc0ba4e2e4dab6aa7c13d1376cc5ebd2ab2c935a2357494ed6db6852f81a4c5d7'
  },
  expiration: new Date('2085-02-19T18:15:17.536Z'),
  authChain: [
    {
      type: AuthLinkType.SIGNER,
      payload: '0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd',
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
      payload:
        'Decentraland Login\nEphemeral address: 0xB31A6030Cd90eb9776eBE6e6A80F152C10A86ee2\nExpiration: 2085-02-19T18:15:17.536Z',
      signature:
        '0x4f2fef0c1c0d1a95f15255e57103ae51ee8a33df105884a3a66931b68e64de2356345d1014be74c9554ff0aa8a592bbe9b98196f97e45568c5c3cfb1f65a50161b'
    }
  ]
}

export const nonOwner: AuthIdentity = {
  ephemeralIdentity: {
    address: '0x36359cd12E64c150a347F1dd3fF95BF68b46b33f',
    privateKey: '0xb8c714a3ccfe8b978870f654b8d099efa6ece221ebf0e369726f30078b2f8c4a',
    publicKey:
      '0x0473a52bd7d9069380ae5fb9b54d6642bba914db54590191c3cdb45b6126a1934e08dd742961a6442b8852c588f98eb1842a44e2fca83986b89cb062689ec96cbf'
  },
  expiration: new Date('2085-02-19T18:16:26.272Z'),
  authChain: [
    {
      type: AuthLinkType.SIGNER,
      payload: '0xdd7dd1c26a89395aa50d39e7fc8c50fa6ea75910',
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
      payload:
        'Decentraland Login\nEphemeral address: 0x36359cd12E64c150a347F1dd3fF95BF68b46b33f\nExpiration: 2085-02-19T18:16:26.272Z',
      signature:
        '0x28c81bad012a478f7ec1a1f9439a5a6628e41a7cc360bf32f86ea987f68f349d5efd034b2e334ac5a377226904c602e862a3360432d0af5d7c2a5f3244f9a04e1c'
    }
  ]
}

export const admin: AuthIdentity = {
  ephemeralIdentity: {
    address: '0xc08971483c3b9F3091c906df9162EF60A0118145',
    privateKey: '0xd2ea313ed64ba887aa986ba724759a4b01f454cb153ff83eec7df4afd9c33449',
    publicKey:
      '0x04a7b881fcb96c777ac40ee004b2a78ef50c201814d70cbca44c2b4f2cc04b4aad02d261c14120e866ad0683794488d4112d1e652b61e070ad4f773e66d994712c'
  },
  expiration: new Date('2085-02-19T18:17:19.692Z'),
  authChain: [
    {
      type: AuthLinkType.SIGNER,
      payload: '0x5babd1869989570988b79b5f5086e17a9e96a235',
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
      payload:
        'Decentraland Login\nEphemeral address: 0xc08971483c3b9F3091c906df9162EF60A0118145\nExpiration: 2085-02-19T18:17:19.692Z',
      signature:
        '0x422f25398b2dd47989d872cda24c5ad8a21c44d4b6be7267cacccfa10268bc3a4200ac66adf300ed245fa0884a95769228fc37722e157b17a571b9d6d41379fc1c'
    }
  ]
}

export function getAuthHeaders(
  method: string,
  path: string,
  metadata: Record<string, any>,
  chainProvider: (payload: string) => AuthChain
) {
  const headers: Record<string, string> = {}
  const timestamp = Date.now()
  const metadataJSON = JSON.stringify(metadata)
  const payloadParts = [method.toLowerCase(), path.toLowerCase(), timestamp.toString(), metadataJSON]
  const payloadToSign = payloadParts.join(':').toLowerCase()

  const chain = chainProvider(payloadToSign)

  chain.forEach((link, index) => {
    headers[`${AUTH_CHAIN_HEADER_PREFIX}${index}`] = JSON.stringify(link)
  })

  headers[AUTH_TIMESTAMP_HEADER] = timestamp.toString()
  headers[AUTH_METADATA_HEADER] = metadataJSON

  return headers
}

export async function makeRequest(fetch: any, path: string, options: any = {}, identity = admin) {
  const url = new URL(path, 'http://127.0.0.1:3001')

  const { metadata, ...otherOptions } = options

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
      ...getAuthHeaders(
        options.method || 'GET',
        url.pathname,
        {
          signer: 'decentraland-kernel-scene',
          ...metadata
        },
        (payload) => Authenticator.signPayload(authIdentity, payload)
      )
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
