import { test } from '../components'
import { makeRequest } from '../utils'
import * as handlersUtils from '../../src/logic/utils'

test('POST /get-server-scene-adapter', ({ components, stubComponents }) => {
  const mockServerPublicKey = 'server-public-key-123'
  const mockSceneId = 'scene-123'
  const mockRealmName = 'test-realm'
  const mockParcel = '10,20'
  const mockWorldRealm = 'test-world.eth'

  // Use the actual return type from the validate function
  type ValidateResult = Awaited<ReturnType<typeof handlersUtils.validate>>

  let validateResult: ValidateResult

  beforeEach(async () => {
    // Set up default validate result
    validateResult = {
      identity: mockServerPublicKey,
      realm: {
        serverName: mockRealmName,
        hostname: 'test-realm.com',
        protocol: 'https'
      },
      sceneId: mockSceneId,
      parcel: mockParcel,
      isWorld: false
    }

    jest.spyOn(handlersUtils, 'validate').mockResolvedValue(validateResult)

    // Set up component mocks
    stubComponents.config.getString.withArgs('AUTHORATIVE_SERVER_PUBLIC_KEY').resolves(mockServerPublicKey)
    stubComponents.blockList.isBlacklisted.resolves(false)
    stubComponents.livekit.getSceneRoomName.resolves('scene-room-name')
    stubComponents.livekit.getWorldRoomName.resolves('world-room-name')
    stubComponents.livekit.generateCredentials.resolves({
      url: 'wss://livekit.example.com',
      token: 'mock-token'
    })
    stubComponents.livekit.buildConnectionUrl.returns('wss://livekit.example.com?token=mock-token')
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  describe('when user is blacklisted', () => {
    beforeEach(() => {
      stubComponents.blockList.isBlacklisted.resolves(true)
    })

    it('should respond with 401 unauthorized', async () => {
      const response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Access denied, deny-listed wallet')
    })
  })

  describe('when identity does not match server public key', () => {
    beforeEach(() => {
      validateResult.identity = 'wrong-identity'
      jest.spyOn(handlersUtils, 'validate').mockResolvedValue(validateResult)
    })

    it('should respond with 401 unauthorized', async () => {
      const response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Access denied, invalid server public key')
    })
  })

  describe('when handling world realms', () => {
    beforeEach(() => {
      validateResult.realm.serverName = mockWorldRealm
      validateResult.realm.hostname = 'worlds-content-server.decentraland.org'
      validateResult.isWorld = true
      jest.spyOn(handlersUtils, 'validate').mockResolvedValue(validateResult)
    })

    it('should generate credentials for world room and return connection details', async () => {
      const response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.adapter).toBe('wss://livekit.example.com?token=mock-token')
    })
  })

  describe('when handling scene realms', () => {
    beforeEach(() => {
      validateResult.realm.serverName = mockRealmName
      jest.spyOn(handlersUtils, 'validate').mockResolvedValue(validateResult)
    })

    it('should generate credentials for scene room and return connection details', async () => {
      const response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.adapter).toBe('wss://livekit.example.com?token=mock-token')
    })

    describe('when sceneId is missing for non-world realm', () => {
      beforeEach(() => {
        validateResult.sceneId = undefined
        jest.spyOn(handlersUtils, 'validate').mockResolvedValue(validateResult)
      })

      it('should respond with 400 bad request', async () => {
        const response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        })

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body.error).toBe('Access denied, invalid signed-fetch request, no sceneId')
      })
    })
  })

  describe('when handling LocalPreview realm', () => {
    beforeEach(() => {
      validateResult.identity = 'any-identity'
      validateResult.realm.serverName = 'LocalPreview'
      jest.spyOn(handlersUtils, 'validate').mockResolvedValue(validateResult)
    })

    it('should allow any identity for LocalPreview realm', async () => {
      const response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.adapter).toBe('wss://livekit.example.com?token=mock-token')
    })
  })

  describe('when validate throws an error', () => {
    beforeEach(() => {
      jest.spyOn(handlersUtils, 'validate').mockRejectedValue(new Error('Validation failed'))
    })

    it('should respond with 500 error', async () => {
      const response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(500)
    })
  })

  describe('when livekit generateCredentials fails', () => {
    beforeEach(() => {
      stubComponents.livekit.generateCredentials.rejects(new Error('Livekit connection failed'))
    })

    it('should respond with 500 error', async () => {
      const response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(500)
    })
  })
})
