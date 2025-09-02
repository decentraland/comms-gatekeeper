import { cachedFetchComponent } from '../../src/adapters/fetch'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

let cachedComponent: Awaited<ReturnType<typeof cachedFetchComponent>>
let mockNodeFetch: jest.Mock
let cachedFunction: ReturnType<typeof cachedComponent.cache>
let fetchingUrl: string
let mockedResponseBody: { data: string }

beforeEach(async () => {
  fetchingUrl = 'https://test-url.com'
  mockNodeFetch = jest.fn()
  const mockFetch = {
    fetch: mockNodeFetch
  }

  const mockLogs = createLoggerMockedComponent()
  cachedComponent = await cachedFetchComponent({
    fetch: mockFetch,
    logs: mockLogs
  })
  cachedFunction = cachedComponent.cache()
  mockedResponseBody = { data: 'test data' }
})

describe('when fetching a URL for the first time', () => {
  beforeEach(() => {
    mockNodeFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue(mockedResponseBody)
    })
  })

  it('should resolve with the fetched response data and call the underlying fetch function', async () => {
    const result = await cachedFunction.fetch(fetchingUrl)
    expect(result).toEqual(mockedResponseBody)
    expect(mockNodeFetch).toHaveBeenCalledWith(fetchingUrl)
  })
})

describe('when fetching the same URL multiple times', () => {
  beforeEach(() => {
    mockNodeFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockedResponseBody)
    })
  })

  it('should resolve with the same response data for both requests', async () => {
    const result1 = await cachedFunction.fetch(fetchingUrl)
    const result2 = await cachedFunction.fetch(fetchingUrl)

    expect(result1).toEqual(mockedResponseBody)
    expect(result2).toEqual(mockedResponseBody)
  })

  it('should call the underlying fetch function only once with the correct URL', async () => {
    await cachedFunction.fetch(fetchingUrl)
    await cachedFunction.fetch(fetchingUrl)

    expect(mockNodeFetch).toHaveBeenCalledTimes(1)
    expect(mockNodeFetch).toHaveBeenCalledWith(fetchingUrl)
  })
})

describe('when the fetch operation fails', () => {
  beforeEach(() => {
    const mockError = new Error('Fetch error')
    mockNodeFetch.mockRejectedValueOnce(mockError)
  })

  describe('and the stale value on rejection flag is set to false', () => {
    it('should reject with the fetch error', async () => {
      await expect(cachedFunction.fetch(fetchingUrl)).rejects.toThrow('Fetch error')
    })
  })

  describe('and the stale value on rejection flag is set to true', () => {
    beforeEach(async () => {
      cachedComponent = await cachedFetchComponent(
        {
          fetch: {
            fetch: mockNodeFetch
          },
          logs: createLoggerMockedComponent()
        },
        { allowStaleOnFetchRejection: true }
      )
      cachedFunction = cachedComponent.cache()
      await cachedFunction.set(fetchingUrl, mockedResponseBody)
    })

    it('should resolve with the stale value', async () => {
      const result = await cachedFunction.fetch(fetchingUrl)
      expect(result).toEqual(mockedResponseBody)
    })
  })
})

describe('when the response is not ok', () => {
  beforeEach(() => {
    mockNodeFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    })
  })

  describe('and the stale value on rejection flag is set to false', () => {
    it('should throw an error with the URL in the message', async () => {
      await expect(cachedFunction.fetch(fetchingUrl)).rejects.toThrow(`Error getting ${fetchingUrl}`)
    })
  })

  describe('and the stale value on rejection flag is set to true', () => {
    let staleData: any

    beforeEach(async () => {
      cachedComponent = await cachedFetchComponent(
        {
          fetch: {
            fetch: mockNodeFetch
          },
          logs: createLoggerMockedComponent()
        },
        { allowStaleOnFetchRejection: true }
      )
      cachedFunction = cachedComponent.cache()
      staleData = await cachedFunction.set(fetchingUrl, mockedResponseBody)
      mockNodeFetch.mockRejectedValueOnce(new Error('Fetch error'))
    })

    it('should return the stale value', async () => {
      const result = await cachedFunction.fetch(fetchingUrl)
      expect(result).toEqual(mockedResponseBody)
    })
  })
})
