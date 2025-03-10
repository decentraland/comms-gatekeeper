import { createSceneFetcherComponent } from '../../src/adapters/scene-fetcher'
import { LRUCache } from 'lru-cache'

describe('SceneFetcherComponent', () => {
  const mockConfig = {
    requireString: jest.fn().mockImplementation((key) => {
      const values = {
        WORLD_CONTENT_URL: 'https://world-content.test',
        CATALYST_CONTENT_URL: 'https://catalyst-content.test',
        PLACES_API_URL: 'https://places-api.test',
        LAMBDAS_URL: 'https://lambdas.test'
      }
      return Promise.resolve(values[key] || '')
    }),
    getString: jest.fn(),
    getNumber: jest.fn(),
    requireNumber: jest.fn()
  }
  const mockFetch = {
    fetch: jest.fn()
  }
  const mockLogs = {
    getLogger: jest.fn().mockReturnValue({
      log: jest.fn(),
      warn: jest.fn()
    })
  }

  let sceneFetcher: Awaited<ReturnType<typeof createSceneFetcherComponent>>

  beforeEach(async () => {
    jest.clearAllMocks()
    sceneFetcher = await createSceneFetcherComponent({
      config: mockConfig,
      fetch: mockFetch,
      logs: mockLogs
    })
  })

  it('should return undefined if the world sceneId is not found', async () => {
    mockFetch.fetch.mockResolvedValueOnce({ json: async () => ({ configurations: { scenesUrn: [] } }) })
    const permissions = await sceneFetcher.fetchWorldPermissions('missing-world')
    expect(permissions).toBeUndefined()
  })

  it('should return default permissions on fetch error', async () => {
    mockFetch.fetch.mockRejectedValueOnce(new Error('Network error'))
    const permissions = await sceneFetcher.fetchScenePermissions('scene-123')
    expect(permissions).toEqual({ cast: [], mute: [] })
    expect(mockLogs.getLogger().warn).toHaveBeenCalled()
  })

  it('should use LRU cache for fetching scene IDs', async () => {
    const cacheSpy = jest.spyOn(LRUCache.prototype, 'fetch')

    mockFetch.fetch.mockResolvedValueOnce({
      json: async () => ({
        configurations: { scenesUrn: ['urn:decentraland:scene:world:cached-scene'] }
      })
    })

    await sceneFetcher.fetchWorldPermissions('cached-world')
    expect(cacheSpy).toHaveBeenCalledWith('cached-world')
  })

  // Tests migrados de utils.spec.ts
  describe('hasLandPermission', () => {
    beforeEach(() => {
      mockFetch.fetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              elements: [
                { category: 'parcel', x: '10', y: '20' },
                { category: 'parcel', x: '30', y: '40' }
              ]
            })
        })
      )
    })

    it('should return false when no positions are provided', async () => {
      const result = await sceneFetcher.hasLandPermission('authAddress', [])
      expect(result).toBe(false)
    })

    it('should return false when user has no land elements', async () => {
      mockFetch.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ elements: [] })
        })
      )

      const result = await sceneFetcher.hasLandPermission('authAddress', ['10,20'])
      expect(result).toBe(false)
    })

    it('should return true when a position matches user land', async () => {
      const result = await sceneFetcher.hasLandPermission('authAddress', ['10,20', '50,60'])
      expect(result).toBe(true)
    })

    it('should return false when no positions match user land', async () => {
      const result = await sceneFetcher.hasLandPermission('authAddress', ['50,60', '70,80'])
      expect(result).toBe(false)
    })
  })

  describe('hasWorldPermission', () => {
    beforeEach(() => {
      mockFetch.fetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              elements: [{ name: 'myworld' }, { name: 'otherworld' }]
            })
        })
      )
    })

    it('should return false when no world name is provided', async () => {
      const result = await sceneFetcher.hasWorldPermission('authAddress', '')
      expect(result).toBe(false)
    })

    it('should return false when user has no name elements', async () => {
      mockFetch.fetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ elements: [] })
        })
      )

      const result = await sceneFetcher.hasWorldPermission('authAddress', 'myworld')
      expect(result).toBe(false)
    })

    it('should return true when world name exactly matches a user name', async () => {
      const result = await sceneFetcher.hasWorldPermission('authAddress', 'myworld')
      expect(result).toBe(true)
    })

    it('should be case insensitive when matching names', async () => {
      const result = await sceneFetcher.hasWorldPermission('authAddress', 'MyWorld')
      expect(result).toBe(true)
    })

    it('should strip .dcl.eth suffix when matching names', async () => {
      const result = await sceneFetcher.hasWorldPermission('authAddress', 'myworld.dcl.eth')
      expect(result).toBe(true)
    })

    it('should strip .eth suffix when matching names', async () => {
      const result = await sceneFetcher.hasWorldPermission('authAddress', 'myworld.eth')
      expect(result).toBe(true)
    })

    it('should return false when name does not match any user name', async () => {
      const result = await sceneFetcher.hasWorldPermission('authAddress', 'unknownworld')
      expect(result).toBe(false)
    })
  })
})
