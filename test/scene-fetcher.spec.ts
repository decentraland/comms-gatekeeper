import { createSceneFetcherComponent } from '../src/adapters/scene-fetcher'
import { Permissions } from '../src/types'
import { LRUCache } from 'lru-cache'

describe('SceneFetcherComponent', () => {
  const mockConfig = {
    requireString: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return undefined if the world sceneId is not found', async () => {
    mockFetch.fetch.mockResolvedValueOnce({ json: async () => ({ configurations: { scenesUrn: [] } }) })
    const sceneFetcher = await createSceneFetcherComponent({ config: mockConfig, fetch: mockFetch, logs: mockLogs })
    const permissions = await sceneFetcher.fetchWorldPermissions('missing-world')

    expect(permissions).toBeUndefined()
  })

  it('should return default permissions on fetch error', async () => {
    mockFetch.fetch.mockRejectedValueOnce(new Error('Network error'))
    const sceneFetcher = await createSceneFetcherComponent({ config: mockConfig, fetch: mockFetch, logs: mockLogs })
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

    const sceneFetcher = await createSceneFetcherComponent({ config: mockConfig, fetch: mockFetch, logs: mockLogs })
    await sceneFetcher.fetchWorldPermissions('cached-world')

    expect(cacheSpy).toHaveBeenCalledWith('cached-world')
  })
})
