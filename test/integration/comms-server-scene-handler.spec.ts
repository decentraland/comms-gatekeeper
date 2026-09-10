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
    stubComponents.config.getString.mockImplementation(async (name: string) =>
      name === 'AUTHORITATIVE_SERVER_ADDRESS' ? mockServerPublicKey : undefined
    )
    stubComponents.denyList.isDenylisted.mockResolvedValue(false)
    stubComponents.livekit.isLocalPreview.mockReturnValue(false)
    stubComponents.livekit.getSceneRoomName.mockReturnValue('scene-room-name')
    stubComponents.livekit.getWorldRoomName.mockReturnValue('world-room-name')
    stubComponents.livekit.generateCredentials.mockResolvedValue({
      url: 'wss://livekit.example.com',
      token: 'mock-token'
    })
    stubComponents.livekit.buildConnectionUrl.mockReturnValue('wss://livekit.example.com?token=mock-token')
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  describe('when user is blacklisted', () => {
    beforeEach(() => {
      stubComponents.denyList.isDenylisted.mockResolvedValue(true)
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

  describe('when handling a LocalPreview realm', () => {
    const previewSceneId = 'b64-preview-scene'
    const previewRoomName = 'genesis-city-prd-scene-room-LocalPreview:b64-preview-scene'

    let response: Awaited<ReturnType<typeof makeRequest>>

    beforeEach(async () => {
      validateResult.identity = 'any-identity'
      validateResult.realm.serverName = 'LocalPreview'
      validateResult.sceneId = previewSceneId
      jest.spyOn(handlersUtils, 'validate').mockResolvedValue(validateResult)
      stubComponents.livekit.isLocalPreview.mockReturnValue(true)
      stubComponents.livekit.getSceneRoomName.mockReturnValue(previewRoomName)

      response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })
    })

    it('should respond with a 200 and the adapter connection url for any identity', async () => {
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ adapter: 'wss://livekit.example.com?token=mock-token' })
      )
    })

    it('should derive the room from the realm and scene id, as /get-scene-adapter does', () => {
      expect(stubComponents.livekit.getSceneRoomName).toHaveBeenCalledWith('LocalPreview', previewSceneId)
    })

    it('should mint the token for that scene room rather than a preview-prefixed one', () => {
      expect(stubComponents.livekit.generateCredentials).toHaveBeenCalledWith(
        'authoritative-server',
        previewRoomName,
        expect.anything(),
        false
      )
    })

    describe('and the request carries no sceneId', () => {
      beforeEach(async () => {
        validateResult.sceneId = undefined
        jest.spyOn(handlersUtils, 'validate').mockResolvedValue(validateResult)

        response = await makeRequest(components.localFetch, '/get-server-scene-adapter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        })
      })

      it('should respond with a 400 and the missing-sceneId error instead of naming a room after undefined', async () => {
        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual(
          expect.objectContaining({ error: 'Access denied, invalid signed-fetch request, no sceneId' })
        )
      })
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
      stubComponents.livekit.generateCredentials.mockRejectedValue(new Error('Livekit connection failed'))
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
