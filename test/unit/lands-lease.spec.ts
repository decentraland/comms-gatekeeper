import { createLandsComponent } from '../../src/adapters/lands'

// The lease behaviors below are now part of the lands component, but they
// don't depend on the LAMBDAS_URL config or the cachedFetch — those are
// only used by getLandPermissions / getLandOperators. This helper provides
// inert defaults so the lease tests stay focused on lease behavior.
const createLandsForLeaseTest = (deps: { fetch: { fetch: jest.Mock }; logs: { getLogger: jest.Mock } }) =>
  createLandsComponent({
    config: {
      requireString: jest.fn().mockResolvedValue('https://lambdas.example.com/api'),
      getString: jest.fn(),
      getNumber: jest.fn(),
      requireNumber: jest.fn()
    } as any,
    cachedFetch: {
      cache: jest.fn().mockReturnValue({ fetch: jest.fn() })
    } as any,
    fetch: deps.fetch as any,
    logs: deps.logs as any
  })

describe('when the lands component is created (lease behaviors)', () => {
  let mockFetch: { fetch: jest.Mock }
  let mockLogs: { getLogger: jest.Mock }
  let mockAuthorizations: any[]
  let lands: any

  beforeEach(() => {
    mockFetch = {
      fetch: jest.fn()
    }

    mockLogs = {
      getLogger: jest.fn().mockReturnValue({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
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

        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should return true', async () => {
        const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

        expect(result).toBe(true)
      })
    })

    describe('and the user does not have lease for the parcel', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockAuthorizations)
        })

        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should return false', async () => {
        const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['999,999'])

        expect(result).toBe(false)
      })
    })

    describe('and the user is not in authorizations', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockAuthorizations)
        })

        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should return false', async () => {
        const result = await lands.hasLandLease('0x9999999999999999999999999999999999999999', ['-73,50'])

        expect(result).toBe(false)
      })
    })

    describe('and the address is in different case', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockAuthorizations)
        })

        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should handle case-insensitive address matching', async () => {
        const result = await lands.hasLandLease('0X1234567890123456789012345678901234567890', ['-73,50'])

        expect(result).toBe(true)
      })
    })

    describe('and the fetch request fails', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockRejectedValue(new Error('Network error'))

        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should return false', async () => {
        const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

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

        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should return false', async () => {
        const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

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

        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should not fetch again within TTL', async () => {
        // First call should fetch
        await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

        // Second call should use cache
        await lands.hasLandLease('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ['-100,100'])

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

        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should fetch fresh data after TTL expires', async () => {
        // First call
        await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

        // Advance time past TTL (5 minutes)
        jest.advanceTimersByTime(5 * 60 * 1000 + 1000)

        // Second call should fetch again
        await lands.hasLandLease('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ['-100,100'])

        expect(mockFetch.fetch).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('and two callers request authorizations concurrently before the first response arrives', () => {
    let firstResult: any
    let secondResult: any

    beforeEach(async () => {
      mockFetch.fetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, json: () => Promise.resolve(mockAuthorizations) }), 0)
          )
      )

      lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      ;[firstResult, secondResult] = await Promise.all([lands.getAuthorizations(), lands.getAuthorizations()])
    })

    it('should issue only one upstream fetch for the shared in-flight call', () => {
      expect(mockFetch.fetch).toHaveBeenCalledTimes(1)
    })

    it('should resolve both callers with the same authorizations payload', () => {
      expect(firstResult.authorizations).toHaveLength(mockAuthorizations.length)
      expect(secondResult).toEqual(firstResult)
    })
  })

  describe('and a refresh fetch fails after the cache has expired', () => {
    let result: any

    beforeEach(async () => {
      jest.useFakeTimers()

      mockFetch.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAuthorizations)
      })

      lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })

      // Populate cache
      await lands.getAuthorizations()

      // Expire cache
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000)

      // Next fetch fails
      mockFetch.fetch.mockRejectedValueOnce(new Error('Network down'))

      result = await lands.getAuthorizations()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should fall back to the previously cached authorizations instead of returning empty', () => {
      expect(result.authorizations).toHaveLength(mockAuthorizations.length)
    })

    it('should have attempted the fresh fetch', () => {
      expect(mockFetch.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('and the fetch fails on the very first call with no cache populated', () => {
    let result: any

    beforeEach(async () => {
      mockFetch.fetch.mockRejectedValueOnce(new Error('Network down'))

      lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })

      result = await lands.getAuthorizations()
    })

    it('should return an empty authorizations payload', () => {
      expect(result).toEqual({ authorizations: [] })
    })
  })

  describe('and refreshAuthorizations is called', () => {
    beforeEach(async () => {
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockAuthorizations)
      })

      lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
    })

    it('should clear cache and fetch fresh data', async () => {
      // First call
      await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])

      // Refresh cache
      await lands.refreshAuthorizations()

      // Second call should fetch again
      await lands.hasLandLease('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ['-100,100'])

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

      lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
    })

    describe('when the user has access through any authorization', () => {
      it('should return true', async () => {
        const result = await lands.hasLandLease('0x5555555555555555555555555555555555555555', ['-73,50'])

        expect(result).toBe(true)
      })
    })

    describe('when the user has no access to any requested parcels', () => {
      it('should return false', async () => {
        const result = await lands.hasLandLease('0x5555555555555555555555555555555555555555', ['777,777'])

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

      lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
    })

    describe('when the user has access to any of the requested parcels', () => {
      it('should return true', async () => {
        const result = await lands.hasLandLease('0x6666666666666666666666666666666666666666', ['-73,50', '999,999'])

        expect(result).toBe(true)
      })
    })

    describe('when the user has access to all requested parcels', () => {
      it('should return true', async () => {
        const result = await lands.hasLandLease('0x6666666666666666666666666666666666666666', ['-73,50', '10,20'])

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

      lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
    })

    it('should return false', async () => {
      const result = await lands.hasLandLease('0x7777777777777777777777777777777777777777', ['-73,50'])

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

      lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
    })

    it('should return true for both users', async () => {
      const result1 = await lands.hasLandLease('0x8888888888888888888888888888888888888888', ['-73,50'])
      const result2 = await lands.hasLandLease('0x9999999999999999999999999999999999999999', ['-73,50'])

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

      lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
    })

    it('should return false', async () => {
      const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', [])

      expect(result).toBe(false)
    })
  })

  describe('and getLeaseHoldersForParcels is called', () => {
    describe('and no parcels are passed', () => {
      beforeEach(async () => {
        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should return an empty array without querying authorizations', async () => {
        const result = await lands.getLeaseHoldersForParcels([])
        expect(result).toEqual([])
        expect(mockFetch.fetch).not.toHaveBeenCalled()
      })
    })

    describe('and an authorization overlaps the requested parcels', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                name: 'lease-1',
                desc: '',
                contactInfo: { name: 'tenant' },
                addresses: ['0xLEASE1', '0xLease2'],
                plots: ['10,20']
              },
              {
                name: 'unrelated',
                desc: '',
                contactInfo: { name: 'other' },
                addresses: ['0xunrelated'],
                plots: ['99,99']
              }
            ])
        })

        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should return only the lowercased addresses for overlapping plots', async () => {
        const result = await lands.getLeaseHoldersForParcels(['10,20', '11,20'])
        expect(new Set(result)).toEqual(new Set(['0xlease1', '0xlease2']))
      })
    })

    describe('and the lease lookup throws', () => {
      beforeEach(async () => {
        mockFetch.fetch.mockRejectedValue(new Error('lease service unavailable'))
        lands = await createLandsForLeaseTest({ fetch: mockFetch, logs: mockLogs })
      })

      it('should swallow the error and return an empty array (failures must not poison callers)', async () => {
        const result = await lands.getLeaseHoldersForParcels(['10,20'])
        expect(result).toEqual([])
      })
    })
  })
})
