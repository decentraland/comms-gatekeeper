import { cachedFetchComponent } from '../../src/adapters/fetch'

describe('CachedFetchComponent', () => {
  let cachedComponent: Awaited<ReturnType<typeof cachedFetchComponent>>
  let mockNodeFetch: jest.Mock

  beforeEach(async () => {
    jest.clearAllMocks()

    mockNodeFetch = jest.fn()

    const mockFetch = {
      fetch: mockNodeFetch
    }

    const mockLogs = {
      getLogger: jest.fn().mockReturnValue({
        log: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      })
    }

    cachedComponent = await cachedFetchComponent({
      fetch: mockFetch,
      logs: mockLogs
    })
  })

  describe('cache function', () => {
    it('should cache fetch responses', async () => {
      const mockResponse = { data: 'test data' }
      mockNodeFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      })

      const cachedFunction = cachedComponent.cache()
      await cachedFunction.set('https://test-url.com', undefined)
      const result = await cachedFunction.fetch('https://test-url.com')

      expect(result).toEqual(mockResponse)
      expect(mockNodeFetch).toHaveBeenCalledWith('https://test-url.com')
    })

    it('should handle fetch errors', async () => {
      const mockError = new Error('Fetch error')
      mockNodeFetch.mockRejectedValueOnce(mockError)

      const cachedFunction = cachedComponent.cache()
      await expect(cachedFunction.fetch('https://test-url.com')).rejects.toThrow('Fetch error')
    })

    it('should handle non-ok responses', async () => {
      mockNodeFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      const cachedFunction = cachedComponent.cache()
      await expect(cachedFunction.fetch('https://test-url.com')).rejects.toThrow('Error getting https://test-url.com')
    })
  })
})
