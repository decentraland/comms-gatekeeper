import { Authenticator } from '@dcl/crypto'
import { AUTH_METADATA_HEADER } from '@dcl/crypto-middleware'
import { test } from '../../components'
import { admin, getAuthHeaders, makeRequest } from '../../utils'
import { InvalidRequestError } from '../../../src/types/errors'

test('Cast: Watcher Token Handler', function ({ components, spyComponents }) {
  let validLocation: string
  let validWorldName: string
  let mockCredentials: any
  let mockCredentialsWithPlace: any

  beforeEach(() => {
    // Watchers can use parcel coordinates or world names
    validLocation = '20,-4'
    validWorldName = 'goerliplaza.dcl.eth'

    mockCredentials = {
      url: 'wss://livekit.example.com',
      token: 'mock-watcher-jwt-token',
      roomId: 'scene:fenrir:bafytest123',
      identity: 'watch:scene:fenrir:bafytest123:123456',
      placeName: 'Test Place'
    }

    mockCredentialsWithPlace = {
      ...mockCredentials,
      placeName: 'Goerli Plaza'
    }

    spyComponents.cast.generateWatcherCredentialsByLocation.mockResolvedValue(mockCredentials)
  })

  describe('when requesting with valid location and identity', () => {
    it('should generate watcher token for valid parcel', async () => {
      const identity = 'clever-bear'
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({ location: validLocation, identity })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBeDefined()
      expect(body.token).toBeDefined()
      expect(body.roomId).toBeDefined()
      expect(body.identity).toBeDefined()
      expect(body.placeName).toBeDefined()
      expect(spyComponents.cast.generateWatcherCredentialsByLocation).toHaveBeenCalledWith(
        validLocation,
        identity,
        expect.any(String),
        undefined,
        undefined
      )
    })

    it('should generate watcher token for valid world name', async () => {
      spyComponents.cast.generateWatcherCredentialsByLocation.mockResolvedValue(mockCredentialsWithPlace)
      const identity = 'clever-bear'
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({ location: validWorldName, identity })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBeDefined()
      expect(body.token).toBeDefined()
      expect(body.roomId).toBeDefined()
      expect(body.identity).toBeDefined()
      expect(body.placeName).toBe('Goerli Plaza')
      expect(spyComponents.cast.generateWatcherCredentialsByLocation).toHaveBeenCalledWith(
        validWorldName,
        identity,
        expect.any(String),
        undefined,
        undefined
      )
    })
  })

  describe('when providing custom identity', () => {
    let customIdentity: string

    beforeEach(() => {
      customIdentity = 'custom-watcher-id'
    })

    it('should use provided identity when given', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({
          location: validLocation,
          identity: customIdentity
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(spyComponents.cast.generateWatcherCredentialsByLocation).toHaveBeenCalledWith(
        validLocation,
        customIdentity,
        expect.any(String),
        undefined,
        undefined
      )
    })
  })

  describe('when location is missing', () => {
    it('should reject requests without location', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({ identity: 'test-user' })
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when identity is missing', () => {
    it('should reject requests without identity', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({ location: validLocation })
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when identity is empty', () => {
    it('should reject requests with empty identity', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({ location: validLocation, identity: '' })
      })

      expect(response.status).toBe(400)
    })

    it('should reject requests with whitespace-only identity', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({ location: validLocation, identity: '   ' })
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when validation fails with invalid request error', () => {
    beforeEach(() => {
      spyComponents.cast.generateWatcherCredentialsByLocation.mockRejectedValue(
        new InvalidRequestError('Internal error')
      )
    })

    it('should handle invalid request errors gracefully', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({ location: validLocation, identity: 'test-user' })
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when the request is not authenticated', () => {
    it('should reject an unsigned request so scene bans can be enforced on the viewer', async () => {
      // Bypass makeRequest (which signs); send a raw request with no signed-fetch headers.
      const response = await components.localFetch.fetch('/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: validLocation, identity: 'anon' })
      })

      // The crypto middleware rejects a missing/malformed auth chain (400) before the handler
      // runs. What matters is that the request never reaches credential generation.
      expect(response.status).not.toBe(200)
      expect(spyComponents.cast.generateWatcherCredentialsByLocation).not.toHaveBeenCalled()
    })
  })

  describe('when the request is signed by a scene', () => {
    it('should reject a decentraland-kernel-scene signer — watcher tokens are for viewers, not scenes', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'decentraland-kernel-scene' },
        body: JSON.stringify({ location: validLocation, identity: 'scene-signed' })
      })

      expect(response.status).not.toBe(200)
      expect(spyComponents.cast.generateWatcherCredentialsByLocation).not.toHaveBeenCalled()
    })

    it('should reject a scene signer signed canonically but delivered in mixed case', async () => {
      // Re-casing the delivered metadata makes the request read differently to the
      // `!== 'decentraland-kernel-scene'` check the authWatcher middleware gates on, so without
      // something rejecting it this scene request is served as if a viewer had signed it.
      //
      // @dcl/crypto-middleware 6 joins the metadata bytes into the signed payload verbatim, so
      // the delivered bytes no longer reproduce what was signed and verification fails outright.
      // Version 5.1.0 caught the same request one step later, with a 400 from its canonical-value
      // guard; that guard is gone because the signature now covers every field rather than two.
      const headers = getAuthHeaders(
        'POST',
        '/cast/watcher-token',
        { signer: 'decentraland-kernel-scene' },
        (payload) => Authenticator.signPayload(admin, payload)
      )
      headers[AUTH_METADATA_HEADER] = JSON.stringify({ signer: 'Decentraland-Kernel-Scene' })

      const response = await components.localFetch.fetch('/cast/watcher-token', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: validLocation, identity: 'scene-signed' })
      })

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        message: expect.stringMatching(/^Invalid signature/)
      })
      expect(spyComponents.cast.generateWatcherCredentialsByLocation).not.toHaveBeenCalled()
    })
  })

  describe('when credentials are generated', () => {
    it('should return proper scene room credentials with place name', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        metadata: { signer: 'dcl:explorer' },
        body: JSON.stringify({ location: validLocation, identity: 'happy-penguin' })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBeDefined()
      expect(body.token).toBeDefined()
      expect(body.roomId).toBeDefined()
      expect(body.identity).toBeDefined()
      expect(body.placeName).toBeDefined()
      // Verify the roomId is in scene format
      expect(body.roomId).toMatch(/^scene:/)
      // Verify identity is in internal format (watch:roomId:timestamp)
      expect(body.identity).toMatch(/^watch:/)
    })
  })
})
