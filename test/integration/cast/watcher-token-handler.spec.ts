import { test } from '../../components'
import { makeRequest } from '../../utils'
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
        body: JSON.stringify({ location: validLocation, identity })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBeDefined()
      expect(body.token).toBeDefined()
      expect(body.roomId).toBeDefined()
      expect(body.identity).toBeDefined()
      expect(body.placeName).toBeDefined()
      expect(spyComponents.cast.generateWatcherCredentialsByLocation).toHaveBeenCalledWith(validLocation, identity)
    })

    it('should generate watcher token for valid world name', async () => {
      spyComponents.cast.generateWatcherCredentialsByLocation.mockResolvedValue(mockCredentialsWithPlace)
      const identity = 'clever-bear'
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: validWorldName, identity })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.url).toBeDefined()
      expect(body.token).toBeDefined()
      expect(body.roomId).toBeDefined()
      expect(body.identity).toBeDefined()
      expect(body.placeName).toBe('Goerli Plaza')
      expect(spyComponents.cast.generateWatcherCredentialsByLocation).toHaveBeenCalledWith(validWorldName, identity)
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
        body: JSON.stringify({
          location: validLocation,
          identity: customIdentity
        })
      })

      const body = await response.json()

      expect(response.status).toBe(200)
      expect(spyComponents.cast.generateWatcherCredentialsByLocation).toHaveBeenCalledWith(
        validLocation,
        customIdentity
      )
    })
  })

  describe('when location is missing', () => {
    it('should reject requests without location', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        body: JSON.stringify({ location: validLocation, identity: '' })
      })

      expect(response.status).toBe(400)
    })

    it('should reject requests with whitespace-only identity', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        body: JSON.stringify({ location: validLocation, identity: 'test-user' })
      })

      expect(response.status).toBe(400)
    })
  })

  describe('when credentials are generated', () => {
    it('should return proper scene room credentials with place name', async () => {
      const response = await makeRequest(components.localFetch, '/cast/watcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
