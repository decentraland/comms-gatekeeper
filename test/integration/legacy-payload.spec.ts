import { Authenticator } from '@dcl/crypto'
import { test } from '../components'
import { getLegacyAuthHeaders, owner } from '../utils'

// Explorer clients (unity, godot, bevy) still sign the pre-6.0.0 payload and send camelCase
// metadata, so these requests cannot verify under the current format. `canonicalMetadataKeys` in
// src/logic/utils.ts accepts them for the rollout window while refusing any whose declared keys
// were re-spelled — which the folded payload could not otherwise distinguish.

test('legacy signed-fetch payload acceptance', function ({ components }) {
  const path = '/get-scene-adapter'
  // The shape godot sends to this route today.
  const METADATA = {
    signer: 'decentraland-kernel-scene',
    sceneId: 'bafkreiAbC123',
    realmName: 'LocalPreview',
    parcel: '10,20'
  }

  function legacyRequest(delivered?: string) {
    return getLegacyAuthHeaders(
      'POST',
      path,
      METADATA,
      (payload) => Authenticator.signPayload(owner, payload),
      delivered
    )
  }

  describe('when a legacy-signed request is delivered unchanged', () => {
    it('should get past signature verification rather than 401', async () => {
      const response = await components.localFetch.fetch(path, {
        method: 'POST',
        headers: { ...legacyRequest(), 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      // The handler may still refuse it for its own reasons; what matters here is that the
      // signature was accepted, so the response is not the 401 an unmigrated client would get.
      expect(response.status).not.toBe(401)
    })
  })

  // The scene-adapter routes verify through validate()/oldValidate(); the rest go through the
  // middleware. Both had to be opted in separately, so both are covered here.
  describe('when a legacy-signed request goes through the middleware instead', () => {
    const mwPath = '/private-messages/token'
    const MW_METADATA = { signer: 'dcl:explorer', sceneId: 'bafkreiAbC123', deviceIdentifier: 'Dev-AbC' }

    it('should be accepted rather than 401', async () => {
      const headers = getLegacyAuthHeaders('GET', mwPath, MW_METADATA, (payload) =>
        Authenticator.signPayload(owner, payload)
      )
      const response = await components.localFetch.fetch(mwPath, { method: 'GET', headers })

      expect(response.status).not.toBe(401)
    })

    it('should refuse a re-cased declared key with the guard own 400', async () => {
      // Not wrapped in UnauthorizedError here, unlike the validate() path, so the guard status
      // reaches the client directly.
      const delivered = JSON.stringify(MW_METADATA).replace('"sceneId"', '"SceneId"')
      const headers = getLegacyAuthHeaders(
        'GET',
        mwPath,
        MW_METADATA,
        (payload) => Authenticator.signPayload(owner, payload),
        delivered
      )
      const response = await components.localFetch.fetch(mwPath, { method: 'GET', headers })

      expect(response.status).toBe(400)
    })
  })

  describe('and a declared key is re-cased after signing', () => {
    it('should reject it rather than read the field as absent', async () => {
      const delivered = JSON.stringify(METADATA).replace('"sceneId"', '"SceneId"')
      expect(delivered).not.toBe(JSON.stringify(METADATA))

      const response = await components.localFetch.fetch(path, {
        method: 'POST',
        headers: { ...legacyRequest(delivered), 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      // 401 rather than the guard's own 400: validate() in logic/utils.ts wraps every verify()
      // failure in UnauthorizedError. What matters is that the request is refused — without the
      // declared key the folded payload would verify and `sceneId` would read as absent.
      expect(response.status).toBe(401)
    })
  })
})
