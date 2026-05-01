import {
  createLandsComponent,
  ILandComponent,
  LandLeaseAuthorization,
  LandsParcelOperatorsResponse,
  LandsParcelPermissionsResponse
} from '../../src/adapters/lands'
import { cachedFetchComponent } from '../../src/adapters/fetch'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

const LAMBDAS_URL = 'https://lambdas.decentraland.org/api'

const buildConfigMock = (lambdasUrl: string = LAMBDAS_URL) =>
  ({
    requireString: jest
      .fn()
      .mockImplementation((key: string) => Promise.resolve(key === 'LAMBDAS_URL' ? lambdasUrl : ''))
  }) as any

describe('LandsComponent', () => {
  let lands: ILandComponent
  let mockLambdasFetch: jest.Mock
  let mockLeaseFetch: { fetch: jest.Mock }

  beforeEach(async () => {
    mockLambdasFetch = jest.fn()
    mockLeaseFetch = { fetch: jest.fn() }

    lands = await createLandsComponent({
      config: buildConfigMock(),
      cachedFetch: { cache: jest.fn().mockReturnValue({ fetch: mockLambdasFetch }) } as any,
      fetch: mockLeaseFetch as any,
      logs: createLoggerMockedComponent()
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when getLandPermissions is called', () => {
    describe('and the user has owner permission', () => {
      let response: LandsParcelPermissionsResponse

      beforeEach(() => {
        response = {
          owner: true,
          operator: false,
          updateOperator: false,
          updateManager: false,
          approvedForAll: false
        }
        mockLambdasFetch.mockResolvedValueOnce(response)
      })

      it('should return the permissions response with owner=true', async () => {
        const result = await lands.getLandPermissions('0xUserAddress', ['10,20', '99,99'])
        expect(result).toEqual(response)
      })

      it('should call the lambdas endpoint with the lowercased address and the first parcel', async () => {
        await lands.getLandPermissions('0xUserAddress', ['10,20', '99,99'])
        expect(mockLambdasFetch).toHaveBeenCalledWith(
          'https://lambdas.decentraland.org/api/users/0xuseraddress/parcels/10/20/permissions'
        )
      })
    })

    describe('and the user has operator permission', () => {
      let response: LandsParcelPermissionsResponse

      beforeEach(() => {
        response = {
          owner: false,
          operator: true,
          updateOperator: false,
          updateManager: false,
          approvedForAll: false
        }
        mockLambdasFetch.mockResolvedValueOnce(response)
      })

      it('should return the permissions response with operator=true', async () => {
        const result = await lands.getLandPermissions('0xUserAddress', ['50,60', '99,99'])
        expect(result).toEqual(response)
      })
    })

    describe('and the lambdas response is empty', () => {
      beforeEach(() => {
        mockLambdasFetch.mockResolvedValueOnce(null)
      })

      it('should throw a LandPermissionsNotFoundError', async () => {
        await expect(lands.getLandPermissions('0xUserAddress', ['10,20'])).rejects.toThrow(
          'Land permissions not found for 0xUserAddress at 10,20'
        )
      })
    })

    describe('and the LAMBDAS_URL is not configured', () => {
      let componentWithoutUrl: ILandComponent

      beforeEach(async () => {
        componentWithoutUrl = await createLandsComponent({
          config: buildConfigMock(''),
          cachedFetch: { cache: jest.fn().mockReturnValue({ fetch: jest.fn() }) } as any,
          fetch: { fetch: jest.fn() } as any,
          logs: createLoggerMockedComponent()
        })
      })

      it('should throw "Lambdas URL is not set"', async () => {
        await expect(componentWithoutUrl.getLandPermissions('0xUserAddress', ['10,20'])).rejects.toThrow(
          'Lambdas URL is not set'
        )
      })
    })
  })

  describe('when getLandOperators is called', () => {
    describe('and the parcel has owner and operator', () => {
      let response: LandsParcelOperatorsResponse

      beforeEach(() => {
        response = {
          owner: '0xOwnerAddress',
          operator: '0xOperatorAddress',
          updateOperator: null,
          updateManagers: [],
          approvedForAll: []
        }
        mockLambdasFetch.mockResolvedValueOnce(response)
      })

      it('should return the operators response with both owner and operator', async () => {
        const result = await lands.getLandOperators('10,20')
        expect(result).toEqual(response)
      })

      it('should call the lambdas endpoint with the parcel coordinates', async () => {
        await lands.getLandOperators('10,20')
        expect(mockLambdasFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/parcels/10/20/operators')
      })
    })

    describe('and the parcel has an updateOperator', () => {
      beforeEach(() => {
        mockLambdasFetch.mockResolvedValueOnce({
          owner: '0xOwnerAddress',
          operator: null,
          updateOperator: '0xUpdateOperatorAddress',
          updateManagers: [],
          approvedForAll: []
        })
      })

      it('should expose the updateOperator in the response', async () => {
        const result = await lands.getLandOperators('10,20')
        expect(result.updateOperator).toBe('0xUpdateOperatorAddress')
      })
    })

    describe('and the parcel has updateManagers', () => {
      beforeEach(() => {
        mockLambdasFetch.mockResolvedValueOnce({
          owner: '0xOwnerAddress',
          operator: null,
          updateOperator: null,
          updateManagers: ['0xUpdateManagerAddress'],
          approvedForAll: []
        })
      })

      it('should expose the updateManagers in the response', async () => {
        const result = await lands.getLandOperators('10,20')
        expect(result.updateManagers).toEqual(['0xUpdateManagerAddress'])
      })
    })

    describe('and the parcel has approvedForAll addresses', () => {
      beforeEach(() => {
        mockLambdasFetch.mockResolvedValueOnce({
          owner: '0xOwnerAddress',
          operator: null,
          updateOperator: null,
          updateManagers: [],
          approvedForAll: ['0xApprovedForAllAddress']
        })
      })

      it('should expose the approvedForAll addresses in the response', async () => {
        const result = await lands.getLandOperators('10,20')
        expect(result.approvedForAll).toEqual(['0xApprovedForAllAddress'])
      })
    })

    describe('and the lambdas response is empty', () => {
      beforeEach(() => {
        mockLambdasFetch.mockResolvedValueOnce(null)
      })

      it('should throw a LandPermissionsNotFoundError', async () => {
        await expect(lands.getLandOperators('10,20')).rejects.toThrow('Land permissions not found for 10,20')
      })
    })

    describe('and the LAMBDAS_URL is not configured', () => {
      let componentWithoutUrl: ILandComponent

      beforeEach(async () => {
        componentWithoutUrl = await createLandsComponent({
          config: buildConfigMock(''),
          cachedFetch: { cache: jest.fn().mockReturnValue({ fetch: jest.fn() }) } as any,
          fetch: { fetch: jest.fn() } as any,
          logs: createLoggerMockedComponent()
        })
      })

      it('should throw "Lambdas URL is not set"', async () => {
        await expect(componentWithoutUrl.getLandOperators('10,20')).rejects.toThrow('Lambdas URL is not set')
      })
    })
  })

  describe('when the lambdas calls go through the real cachedFetch component', () => {
    let cachedFetchFetch: jest.Mock
    let cachedLands: ILandComponent

    beforeEach(async () => {
      cachedFetchFetch = jest.fn()
      const realCachedFetch = await cachedFetchComponent({
        fetch: { fetch: cachedFetchFetch },
        logs: createLoggerMockedComponent()
      })

      cachedLands = await createLandsComponent({
        config: buildConfigMock(),
        cachedFetch: realCachedFetch,
        fetch: { fetch: jest.fn() } as any,
        logs: createLoggerMockedComponent()
      })
    })

    describe('and getLandPermissions is called twice with the same address and parcel', () => {
      beforeEach(async () => {
        cachedFetchFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            owner: true,
            operator: false,
            updateOperator: false,
            updateManager: false,
            approvedForAll: false
          })
        })

        await cachedLands.getLandPermissions('0xUserAddress', ['10,20'])
        await cachedLands.getLandPermissions('0xUserAddress', ['10,20'])
      })

      it('should hit the upstream only once', () => {
        expect(cachedFetchFetch).toHaveBeenCalledTimes(1)
      })
    })

    describe('and getLandPermissions is called for the same address with different casings', () => {
      beforeEach(async () => {
        cachedFetchFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            owner: true,
            operator: false,
            updateOperator: false,
            updateManager: false,
            approvedForAll: false
          })
        })

        await cachedLands.getLandPermissions('0xUserAddress', ['10,20'])
        await cachedLands.getLandPermissions('0xuseraddress', ['10,20'])
      })

      it('should share the cache entry across casings', () => {
        expect(cachedFetchFetch).toHaveBeenCalledTimes(1)
      })
    })

    describe('and getLandOperators is called twice for the same parcel', () => {
      beforeEach(async () => {
        cachedFetchFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            owner: '0xOwnerAddress',
            operator: null,
            updateOperator: null,
            updateManagers: [],
            approvedForAll: []
          })
        })

        await cachedLands.getLandOperators('10,20')
        await cachedLands.getLandOperators('10,20')
      })

      it('should hit the upstream only once', () => {
        expect(cachedFetchFetch).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('when hasLandLease is called', () => {
    let sampleAuthorizations: LandLeaseAuthorization[]

    beforeEach(() => {
      sampleAuthorizations = [
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
    })

    describe('and the user is authorized to lease the requested parcel', () => {
      beforeEach(() => {
        mockLeaseFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(sampleAuthorizations)
        })
      })

      it('should return true', async () => {
        const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])
        expect(result).toBe(true)
      })
    })

    describe('and the user is queried with a different address casing', () => {
      beforeEach(() => {
        mockLeaseFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(sampleAuthorizations)
        })
      })

      it('should match case-insensitively and return true', async () => {
        const result = await lands.hasLandLease('0X1234567890123456789012345678901234567890', ['-73,50'])
        expect(result).toBe(true)
      })
    })

    describe('and the user is authorized but not for any of the requested parcels', () => {
      beforeEach(() => {
        mockLeaseFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(sampleAuthorizations)
        })
      })

      it('should return false', async () => {
        const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['999,999'])
        expect(result).toBe(false)
      })
    })

    describe('and the user is absent from the authorizations document', () => {
      beforeEach(() => {
        mockLeaseFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(sampleAuthorizations)
        })
      })

      it('should return false', async () => {
        const result = await lands.hasLandLease('0x9999999999999999999999999999999999999999', ['-73,50'])
        expect(result).toBe(false)
      })
    })

    describe('and the parcels list is empty', () => {
      beforeEach(() => {
        mockLeaseFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(sampleAuthorizations)
        })
      })

      it('should return false', async () => {
        const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', [])
        expect(result).toBe(false)
      })
    })

    describe('and the upstream lease fetch rejects', () => {
      beforeEach(() => {
        mockLeaseFetch.fetch.mockRejectedValue(new Error('Network error'))
      })

      it('should return false', async () => {
        const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])
        expect(result).toBe(false)
      })
    })

    describe('and the upstream lease fetch responds with a non-ok status', () => {
      beforeEach(() => {
        mockLeaseFetch.fetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })
      })

      it('should return false', async () => {
        const result = await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])
        expect(result).toBe(false)
      })
    })
  })

  describe('when getAuthorizations is called', () => {
    let sampleAuthorizations: LandLeaseAuthorization[]

    beforeEach(() => {
      sampleAuthorizations = [
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
    })

    describe('and a fresh result is cached and queried again within the TTL', () => {
      beforeEach(async () => {
        mockLeaseFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(sampleAuthorizations)
        })
        await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])
        await lands.hasLandLease('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ['-100,100'])
      })

      it('should hit the upstream only once across the two calls', () => {
        expect(mockLeaseFetch.fetch).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the cache has expired', () => {
      beforeEach(async () => {
        jest.useFakeTimers()
        mockLeaseFetch.fetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(sampleAuthorizations)
        })
        await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])
        jest.advanceTimersByTime(5 * 60 * 1000 + 1000)
        await lands.hasLandLease('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ['-100,100'])
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should refetch fresh data on the second call', () => {
        expect(mockLeaseFetch.fetch).toHaveBeenCalledTimes(2)
      })
    })

    describe('and two callers request authorizations concurrently', () => {
      let firstResult: any
      let secondResult: any

      beforeEach(async () => {
        mockLeaseFetch.fetch.mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve({ ok: true, json: () => Promise.resolve(sampleAuthorizations) }), 0)
            )
        )
        ;[firstResult, secondResult] = await Promise.all([lands.getAuthorizations(), lands.getAuthorizations()])
      })

      it('should issue only one upstream fetch (in-flight dedup)', () => {
        expect(mockLeaseFetch.fetch).toHaveBeenCalledTimes(1)
      })

      it('should resolve both callers with the same payload', () => {
        expect(firstResult).toEqual(secondResult)
      })
    })

    describe('and the refresh fetch fails after the cache has expired', () => {
      let result: any

      beforeEach(async () => {
        jest.useFakeTimers()
        mockLeaseFetch.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(sampleAuthorizations)
        })
        await lands.getAuthorizations()
        jest.advanceTimersByTime(5 * 60 * 1000 + 1000)
        mockLeaseFetch.fetch.mockRejectedValueOnce(new Error('Network down'))
        result = await lands.getAuthorizations()
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should serve the previously cached authorizations rather than an empty payload', () => {
        expect(result.authorizations).toHaveLength(sampleAuthorizations.length)
      })

      it('should still attempt the fresh fetch', () => {
        expect(mockLeaseFetch.fetch).toHaveBeenCalledTimes(2)
      })
    })

    describe('and the very first fetch fails with no cache populated', () => {
      let result: any

      beforeEach(async () => {
        mockLeaseFetch.fetch.mockRejectedValueOnce(new Error('Network down'))
        result = await lands.getAuthorizations()
      })

      it('should return an empty authorizations payload', () => {
        expect(result).toEqual({ authorizations: [] })
      })
    })
  })

  describe('when refreshAuthorizations is called', () => {
    let sampleAuthorizations: LandLeaseAuthorization[]

    beforeEach(async () => {
      sampleAuthorizations = [
        {
          name: 'Test Authorization 1',
          desc: '',
          contactInfo: { name: '' },
          addresses: ['0x1234567890123456789012345678901234567890'],
          plots: ['-73,50']
        }
      ]
      mockLeaseFetch.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleAuthorizations)
      })

      await lands.hasLandLease('0x1234567890123456789012345678901234567890', ['-73,50'])
      await lands.refreshAuthorizations()
      await lands.hasLandLease('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd', ['-100,100'])
    })

    it('should clear the cache and trigger a fresh fetch', () => {
      expect(mockLeaseFetch.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('when getLeaseHoldersForParcels is called', () => {
    describe('and no parcels are passed', () => {
      let result: string[]

      beforeEach(async () => {
        result = await lands.getLeaseHoldersForParcels([])
      })

      it('should return an empty array', () => {
        expect(result).toEqual([])
      })

      it('should not query the lease authorizations', () => {
        expect(mockLeaseFetch.fetch).not.toHaveBeenCalled()
      })
    })

    describe('and an authorization overlaps the requested parcels', () => {
      let result: string[]

      beforeEach(async () => {
        mockLeaseFetch.fetch.mockResolvedValue({
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
        result = await lands.getLeaseHoldersForParcels(['10,20', '11,20'])
      })

      it('should return only the lowercased addresses for overlapping plots', () => {
        expect(new Set(result)).toEqual(new Set(['0xlease1', '0xlease2']))
      })
    })

    describe('and the upstream fetch throws', () => {
      let result: string[]

      beforeEach(async () => {
        mockLeaseFetch.fetch.mockRejectedValue(new Error('lease service unavailable'))
        result = await lands.getLeaseHoldersForParcels(['10,20'])
      })

      it('should swallow the error and return an empty array', () => {
        expect(result).toEqual([])
      })
    })
  })
})
