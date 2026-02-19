import { ILoggerComponent } from '@well-known-components/interfaces'
import { createWorldsComponent } from '../../src/adapters/worlds'
import { IWorldComponent, WorldScene } from '../../src/types/worlds.type'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createCachedFetchMockedComponent } from '../mocks/cached-fetch'

describe('worlds adapter', () => {
  const worldContentUrl = 'https://worlds-content.example.com'
  const lambdasUrl = 'https://lambdas.example.com/'

  let worldsComponent: IWorldComponent
  let mockConfig: ReturnType<typeof createConfigMockedComponent>
  let mockLogger: jest.Mocked<ILoggerComponent.ILogger>
  let mockFetch: { fetch: jest.Mock }
  let mockCachedFetch: ReturnType<typeof createCachedFetchMockedComponent>

  beforeEach(async () => {
    mockConfig = createConfigMockedComponent({
      requireString: jest.fn().mockImplementation((key) => {
        switch (key) {
          case 'WORLD_CONTENT_URL':
            return Promise.resolve(worldContentUrl)
          case 'LAMBDAS_URL':
            return Promise.resolve(lambdasUrl)
          default:
            return Promise.reject(new Error(`Unknown key: ${key}`))
        }
      })
    })

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn()
    }

    mockFetch = { fetch: jest.fn() }
    mockCachedFetch = createCachedFetchMockedComponent()

    worldsComponent = await createWorldsComponent({
      config: mockConfig,
      logs: {
        getLogger: jest.fn().mockReturnValue(mockLogger)
      },
      fetch: mockFetch,
      cachedFetch: mockCachedFetch
    })
  })

  describe('when fetching a world scene by pointer', () => {
    const worldName = 'myworld.dcl.eth'
    const pointer = '0,0'

    describe('and the request is successful', () => {
      describe('and a scene is found for the pointer', () => {
        let result: WorldScene | undefined
        let mockScene: WorldScene

        beforeEach(async () => {
          mockScene = {
            worldName: worldName.toLowerCase(),
            deployer: '0x1234567890abcdef1234567890abcdef12345678',
            entityId: 'bafkreiabc123',
            parcels: ['0,0', '0,1', '1,0', '1,1']
          }

          mockFetch.fetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
              scenes: [mockScene],
              total: 1
            })
          })

          result = await worldsComponent.fetchWorldSceneByPointer(worldName, pointer)
        })

        it('should call the world content server with the correct URL and body and return the scene', () => {
          expect(mockFetch.fetch).toHaveBeenCalledWith(`${worldContentUrl}/world/${worldName.toLowerCase()}/scenes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pointers: [pointer] })
          })
          expect(result).toEqual(mockScene)
        })
      })

      describe('and no scenes are returned', () => {
        let result: WorldScene | undefined

        beforeEach(async () => {
          mockFetch.fetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
              scenes: [],
              total: 0
            })
          })

          result = await worldsComponent.fetchWorldSceneByPointer(worldName, pointer)
        })

        it('should return undefined', () => {
          expect(result).toBeUndefined()
        })
      })

      describe('and the scenes array is undefined', () => {
        let result: WorldScene | undefined

        beforeEach(async () => {
          mockFetch.fetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
              total: 0
            })
          })

          result = await worldsComponent.fetchWorldSceneByPointer(worldName, pointer)
        })

        it('should return undefined', () => {
          expect(result).toBeUndefined()
        })
      })
    })

    describe('and the request fails', () => {
      let result: WorldScene | undefined

      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: false,
          status: 500
        })

        result = await worldsComponent.fetchWorldSceneByPointer(worldName, pointer)
      })

      it('should return undefined', () => {
        expect(result).toBeUndefined()
      })
    })

    describe('and the world name has uppercase letters', () => {
      const uppercaseWorldName = 'MyWorld.DCL.ETH'

      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            scenes: [],
            total: 0
          })
        })

        await worldsComponent.fetchWorldSceneByPointer(uppercaseWorldName, pointer)
      })

      it('should lowercase the world name in the URL', () => {
        expect(mockFetch.fetch).toHaveBeenCalledWith(
          `${worldContentUrl}/world/${uppercaseWorldName.toLowerCase()}/scenes`,
          expect.any(Object)
        )
      })
    })
  })

  describe('when fetching the scene ID for a world', () => {
    const worldName = 'myworld.dcl.eth'
    const sceneHash = 'bafkreihxhz7kn2fkptfnvj2wmrzxmchhnq4r3ahnhlpy7r7ds4azr4z4zu'

    describe('and the about endpoint returns a valid response with scenesUrn', () => {
      let result: string

      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            configurations: {
              scenesUrn: [
                `urn:decentraland:entity:${sceneHash}?=&baseUrl=https://worlds-content-server.decentraland.org/contents/`
              ]
            }
          })
        })

        result = await worldsComponent.fetchWorldSceneId(worldName)
      })

      it('should call the about endpoint with the lowercased world name', () => {
        expect(mockFetch.fetch).toHaveBeenCalledWith(`${worldContentUrl}/world/${worldName.toLowerCase()}/about`)
      })

      it('should return the extracted scene entity ID', () => {
        expect(result).toBe(sceneHash)
      })
    })

    describe('and the about endpoint returns a non-200 status', () => {
      beforeEach(() => {
        mockFetch.fetch.mockResolvedValue({
          ok: false,
          status: 404
        })
      })

      it('should throw an InvalidRequestError', async () => {
        await expect(worldsComponent.fetchWorldSceneId(worldName)).rejects.toThrow(
          `Failed to fetch world about for ${worldName}: HTTP 404`
        )
      })
    })

    describe('and the response has no scenesUrn', () => {
      beforeEach(() => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            configurations: {}
          })
        })
      })

      it('should throw an InvalidRequestError', async () => {
        await expect(worldsComponent.fetchWorldSceneId(worldName)).rejects.toThrow(
          `No scenes found for world ${worldName}`
        )
      })
    })

    describe('and the scenesUrn array is empty', () => {
      beforeEach(() => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            configurations: {
              scenesUrn: []
            }
          })
        })
      })

      it('should throw an InvalidRequestError', async () => {
        await expect(worldsComponent.fetchWorldSceneId(worldName)).rejects.toThrow(
          `No scenes found for world ${worldName}`
        )
      })
    })

    describe('and the scenesUrn has an invalid format', () => {
      beforeEach(() => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            configurations: {
              scenesUrn: ['not-a-valid-urn']
            }
          })
        })
      })

      it('should throw an InvalidRequestError', async () => {
        await expect(worldsComponent.fetchWorldSceneId(worldName)).rejects.toThrow(
          `Invalid scene URN format for world ${worldName}: not-a-valid-urn`
        )
      })
    })

    describe('and the world name has uppercase letters', () => {
      const uppercaseWorldName = 'MyWorld.DCL.ETH'

      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: jest.fn().mockResolvedValue({
            configurations: {
              scenesUrn: [
                `urn:decentraland:entity:${sceneHash}?=&baseUrl=https://worlds-content-server.decentraland.org/contents/`
              ]
            }
          })
        })

        await worldsComponent.fetchWorldSceneId(uppercaseWorldName)
      })

      it('should lowercase the world name in the URL', () => {
        expect(mockFetch.fetch).toHaveBeenCalledWith(
          `${worldContentUrl}/world/${uppercaseWorldName.toLowerCase()}/about`
        )
      })
    })
  })
})
