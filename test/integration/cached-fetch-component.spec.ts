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
    it('should cache fetch responses with GET method', async () => {
      const mockResponse = { data: 'test data' }
      mockNodeFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      })

      const cachedFunction = cachedComponent.cache()
      const result = await cachedFunction.fetch('https://test-url.com')

      expect(result).toEqual(mockResponse)
      expect(mockNodeFetch).toHaveBeenCalledWith('https://test-url.com', { method: 'GET' })
    })

    it('should reuse cached results for repeated GET requests', async () => {
      const mockResponse = { data: 'test data' }
      mockNodeFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      })

      const cachedFunction = cachedComponent.cache()
      const result1 = await cachedFunction.fetch('https://test-url.com')
      expect(result1).toEqual(mockResponse)
      expect(mockNodeFetch).toHaveBeenCalledTimes(1)

      const result2 = await cachedFunction.fetch('https://test-url.com')
      expect(result2).toEqual(mockResponse)

      expect(mockNodeFetch).toHaveBeenCalledTimes(1)
      expect(mockNodeFetch).toHaveBeenCalledWith('https://test-url.com', { method: 'GET' })
    })

    it('should handle fetch errors for GET requests', async () => {
      const mockError = new Error('Fetch error')
      mockNodeFetch.mockRejectedValueOnce(mockError)

      const cachedFunction = cachedComponent.cache()
      await expect(cachedFunction.fetch('https://test-url.com')).rejects.toThrow('Fetch error')
    })

    it('should handle non-ok responses for GET requests', async () => {
      mockNodeFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      const cachedFunction = cachedComponent.cache()
      await expect(cachedFunction.fetch('https://test-url.com')).rejects.toThrow('Error getting https://test-url.com')
    })

    it('should support POST method with body', async () => {
      const mockResponse = { success: true }
      mockNodeFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      })

      const cachedFunction = cachedComponent.cache()
      const postBody = { name: 'test', value: 123 }
      const result = await cachedFunction.post('https://test-url.com/post-endpoint', postBody)

      expect(result).toEqual(mockResponse)
      expect(mockNodeFetch).toHaveBeenCalledWith('https://test-url.com/post-endpoint', {
        method: 'POST',
        body: JSON.stringify(postBody),
        headers: {
          'Content-Type': 'application/json'
        }
      })
    })

    it('should handle POST method with no body', async () => {
      const mockResponse = { success: true }
      mockNodeFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      })

      const cachedFunction = cachedComponent.cache()
      const result = await cachedFunction.post('https://test-url.com/empty-post')

      expect(result).toEqual(mockResponse)
      expect(mockNodeFetch).toHaveBeenCalledWith('https://test-url.com/empty-post', { method: 'POST' })
    })
  })
})
