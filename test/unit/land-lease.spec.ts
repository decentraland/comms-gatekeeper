import { createLandLeaseComponent } from '../../src/adapters/land-lease'

describe('when the land lease component is created', () => {
  let mockFetch: { fetch: jest.Mock }
  let mockLogs: { getLogger: jest.Mock }
  let mockAuthorizations: any[]
  let landLease: any

  beforeEach(() => {
    mockFetch = {
      fetch: jest.fn()
    }

    mockLogs = {
      getLogger: jest.fn().mockReturnValue({
        debug: jest.fn().mockImplementation((...args) => console.log('DEBUG:', ...args)),
        info: jest.fn(),
        error: jest.fn()
      })
    }

    // Mock the raw API response (array format)
    mockAuthorizations = [
      {
        name: 'Test Authorization 1',
        desc: 'Test Description 1',
        contactInfo: { name: 'Test Contact 1' },
        addresses: ['0x1234567890123456789012345678901234567890'],
        plots: ['-73,50', '10,20']
      },
      {
        name: 'Test Authorization 2',
        desc: 'Test Description 2',
        contactInfo: { name: 'Test Contact 2' },
        addresses: ['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'],
        plots: ['-100,100']
      }
    ]

    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and hasLandLease is called', () => {
    describe('and the user has lease for the parcel', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockAuthorizations)
        })

        landLease = await createLandLeaseComponent({
          fetch: mockFetch,
          logs: mockLogs
        })
      })

      it('should return true', async () => {
        const result = await landLease.hasLandLease(
          '0x1234567890123456789012345678901234567890',
          ['-73,50']
        )

        expect(result).toBe(true)
      })
    })

    describe('and the user does not have lease for the parcel', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockAuthorizations)
        })

        landLease = await createLandLeaseComponent({
          fetch: mockFetch,
          logs: mockLogs
        })
      })

      it('should return false', async () => {
        const result = await landLease.hasLandLease(
          '0x1234567890123456789012345678901234567890',
          ['999,999']
        )

        expect(result).toBe(false)
      })
    })

    describe('and the user is not in authorizations', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockAuthorizations)
        })

        landLease = await createLandLeaseComponent({
          fetch: mockFetch,
          logs: mockLogs
        })
      })

      it('should return false', async () => {
        const result = await landLease.hasLandLease(
          '0x9999999999999999999999999999999999999999',
          ['-73,50']
        )

        expect(result).toBe(false)
      })
    })

    describe('and the address is in different case', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockAuthorizations)
        })

        landLease = await createLandLeaseComponent({
          fetch: mockFetch,
          logs: mockLogs
        })
      })

      it('should handle case-insensitive address matching', async () => {
        const result = await landLease.hasLandLease(
          '0X1234567890123456789012345678901234567890',
          ['-73,50']
        )

        expect(result).toBe(true)
      })
    })

    describe('and the fetch request fails', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockRejectedValue(new Error('Network error'))

        landLease = await createLandLeaseComponent({
          fetch: mockFetch,
          logs: mockLogs
        })
      })

      it('should return false', async () => {
        const result = await landLease.hasLandLease(
          '0x1234567890123456789012345678901234567890',
          ['-73,50']
        )

        expect(result).toBe(false)
      })
    })

    describe('and the fetch response is not ok', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        })

        landLease = await createLandLeaseComponent({
          fetch: mockFetch,
          logs: mockLogs
        })
      })

      it('should return false', async () => {
        const result = await landLease.hasLandLease(
          '0x1234567890123456789012345678901234567890',
          ['-73,50']
        )

        expect(result).toBe(false)
      })
    })
  })

  describe('and caching is tested', () => {
    describe('and the cache is valid', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockAuthorizations)
        })

        landLease = await createLandLeaseComponent({
          fetch: mockFetch,
          logs: mockLogs
        })
      })

      it('should not fetch again within TTL', async () => {
        // First call should fetch
        await landLease.hasLandLease(
          '0x1234567890123456789012345678901234567890',
          ['-73,50']
        )

        // Second call should use cache
        await landLease.hasLandLease(
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          ['-100,100']
        )

        expect(mockFetch.fetch).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the cache has expired', () => {
      beforeEach(async () => {
        jest.useFakeTimers()

        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockAuthorizations)
        })

        landLease = await createLandLeaseComponent({
          fetch: mockFetch,
          logs: mockLogs
        })
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should fetch fresh data after TTL expires', async () => {
        // First call
        await landLease.hasLandLease(
          '0x1234567890123456789012345678901234567890',
          ['-73,50']
        )

        // Advance time past TTL (5 minutes)
        jest.advanceTimersByTime(5 * 60 * 1000 + 1000)

        // Second call should fetch again
        await landLease.hasLandLease(
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          ['-100,100']
        )

        expect(mockFetch.fetch).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('and refreshAuthorizations is called', () => {
    beforeEach(async () => {
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAuthorizations)
      })

      landLease = await createLandLeaseComponent({
        fetch: mockFetch,
        logs: mockLogs
      })
    })

    it('should clear cache and fetch fresh data', async () => {
      // First call
      await landLease.hasLandLease(
        '0x1234567890123456789012345678901234567890',
        ['-73,50']
      )

      // Refresh cache
      await landLease.refreshAuthorizations()

      // Second call should fetch again
      await landLease.hasLandLease(
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        ['-100,100']
      )

      expect(mockFetch.fetch).toHaveBeenCalledTimes(2)
    })
  })
}) 