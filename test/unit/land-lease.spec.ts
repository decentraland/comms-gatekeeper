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
        debug: jest.fn(),
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
        const result = await landLease.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

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
        const result = await landLease.hasLandLease('0x1234567890123456789012345678901234567890', ['999,999'])

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
        const result = await landLease.hasLandLease('0x9999999999999999999999999999999999999999', ['-73,50'])

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
        const result = await landLease.hasLandLease('0X1234567890123456789012345678901234567890', ['-73,50'])

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
        const result = await landLease.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

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
        const result = await landLease.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

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
        await landLease.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

        // Second call should use cache
        await landLease.hasLandLease('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ['-100,100'])

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
        await landLease.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

        // Advance time past TTL (5 minutes)
        jest.advanceTimersByTime(5 * 60 * 1000 + 1000)

        // Second call should fetch again
        await landLease.hasLandLease('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ['-100,100'])

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
      await landLease.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

      // Refresh cache
      await landLease.refreshAuthorizations()

      // Second call should fetch again
      await landLease.hasLandLease('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ['-100,100'])

      expect(mockFetch.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('and the user has multiple authorizations with different parcels', () => {
    beforeEach(async () => {
      const multipleAuthorizations = [
        {
          name: 'First Authorization',
          desc: 'Has user address but different parcels',
          contactInfo: { name: 'Contact 1' },
          addresses: ['0x5555555555555555555555555555555555555555'],
          plots: ['999,999', '888,888']
        },
        {
          name: 'Second Authorization',
          desc: 'Has user address and correct parcels',
          contactInfo: { name: 'Contact 2' },
          addresses: ['0x5555555555555555555555555555555555555555'],
          plots: ['-73,50', '10,20']
        }
      ]

      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(multipleAuthorizations)
      })

      landLease = await createLandLeaseComponent({
        fetch: mockFetch,
        logs: mockLogs
      })
    })

    describe('when the user has access through any authorization', () => {
      it('should return true', async () => {
        const result = await landLease.hasLandLease('0x5555555555555555555555555555555555555555', ['-73,50'])

        expect(result).toBe(true)
      })
    })

    describe('when the user has no access to any requested parcels', () => {
      it('should return false', async () => {
        const result = await landLease.hasLandLease('0x5555555555555555555555555555555555555555', ['777,777'])

        expect(result).toBe(false)
      })
    })
  })

  describe('and the user has access to multiple parcels from same authorization', () => {
    beforeEach(async () => {
      const multiParcelAuthorization = [
        {
          name: 'Multi Parcel Authorization',
          desc: 'Has user address and multiple parcels',
          contactInfo: { name: 'Contact 1' },
          addresses: ['0x6666666666666666666666666666666666666666'],
          plots: ['-73,50', '10,20', '30,40']
        }
      ]

      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(multiParcelAuthorization)
      })

      landLease = await createLandLeaseComponent({
        fetch: mockFetch,
        logs: mockLogs
      })
    })

    describe('when the user has access to any of the requested parcels', () => {
      it('should return true', async () => {
        const result = await landLease.hasLandLease('0x6666666666666666666666666666666666666666', ['-73,50', '999,999'])

        expect(result).toBe(true)
      })
    })

    describe('when the user has access to all requested parcels', () => {
      it('should return true', async () => {
        const result = await landLease.hasLandLease('0x6666666666666666666666666666666666666666', ['-73,50', '10,20'])

        expect(result).toBe(true)
      })
    })
  })

  describe('and the user has access but not to the specific parcels requested', () => {
    beforeEach(async () => {
      const limitedAccessAuthorization = [
        {
          name: 'Limited Access Authorization',
          desc: 'Has user address but limited parcels',
          contactInfo: { name: 'Contact 1' },
          addresses: ['0x7777777777777777777777777777777777777777'],
          plots: ['-100,100', '200,300']
        }
      ]

      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(limitedAccessAuthorization)
      })

      landLease = await createLandLeaseComponent({
        fetch: mockFetch,
        logs: mockLogs
      })
    })

    it('should return false', async () => {
      const result = await landLease.hasLandLease('0x7777777777777777777777777777777777777777', ['-73,50'])

      expect(result).toBe(false)
    })
  })

  describe('and multiple users have access to the same parcels', () => {
    beforeEach(async () => {
      const sharedAccessAuthorization = [
        {
          name: 'Shared Access Authorization',
          desc: 'Multiple users have access to same parcels',
          contactInfo: { name: 'Contact 1' },
          addresses: ['0x8888888888888888888888888888888888888888', '0x9999999999999999999999999999999999999999'],
          plots: ['-73,50', '10,20']
        }
      ]

      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sharedAccessAuthorization)
      })

      landLease = await createLandLeaseComponent({
        fetch: mockFetch,
        logs: mockLogs
      })
    })

    it('should return true for both users', async () => {
      const result1 = await landLease.hasLandLease('0x8888888888888888888888888888888888888888', ['-73,50'])
      const result2 = await landLease.hasLandLease('0x9999999999999999999999999999999999999999', ['-73,50'])

      expect(result1).toBe(true)
      expect(result2).toBe(true)
    })
  })

  describe('and the parcels array is empty', () => {
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
      const result = await landLease.hasLandLease('0x1234567890123456789012345678901234567890', [])

      expect(result).toBe(false)
    })
  })
})
