import {
  createLandsComponent,
  LandsParcelPermissionsResponse,
  LandsParcelOperatorsResponse
} from '../../src/adapters/lands'
import { cachedFetchComponent } from '../../src/adapters/fetch'
import { ILandLeaseComponent } from '../../src/types/land-lease.type'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

const createLandLeaseMock = (
  overrides?: Partial<jest.Mocked<ILandLeaseComponent>>
): jest.Mocked<ILandLeaseComponent> => ({
  hasLandLease: jest.fn(),
  getAuthorizations: jest.fn().mockResolvedValue({ authorizations: [] }),
  refreshAuthorizations: jest.fn(),
  ...overrides
})

describe('LandsComponent', () => {
  let landsComponent: Awaited<ReturnType<typeof createLandsComponent>>
  let mockFetch: jest.Mock

  beforeEach(async () => {
    jest.clearAllMocks()

    mockFetch = jest.fn()

    const mockConfig = {
      requireString: jest.fn().mockImplementation((key) => {
        const values = {
          LAMBDAS_URL: 'https://lambdas.decentraland.org/api'
        }
        return Promise.resolve(values[key] || '')
      }),
      getString: jest.fn(),
      getNumber: jest.fn(),
      requireNumber: jest.fn()
    }

    const mockLogs = {
      getLogger: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn()
      })
    }

    const mockCachedFetch = {
      cache: jest.fn().mockImplementation(() => ({
        fetch: mockFetch
      }))
    }

    landsComponent = await createLandsComponent({
      landLease: createLandLeaseMock(),
      config: mockConfig,
      cachedFetch: mockCachedFetch,
      logs: mockLogs
    })
  })

  describe('getLandUpdatePermission', () => {
    it('should return owner=true when user has owner permission', async () => {
      const mockParcelPermissionsResponse: LandsParcelPermissionsResponse = {
        owner: true,
        operator: false,
        updateOperator: false,
        updateManager: false,
        approvedForAll: false
      }

      mockFetch.mockResolvedValueOnce(mockParcelPermissionsResponse)

      const result = await landsComponent.getLandPermissions('0xUserAddress', ['10,20', '99,99'])
      expect(result).toEqual({
        owner: true,
        operator: false,
        updateOperator: false,
        updateManager: false,
        approvedForAll: false
      })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://lambdas.decentraland.org/api/users/0xuseraddress/parcels/10/20/permissions'
      )
    })

    it('should return operator=true when user has operator permission', async () => {
      const mockParcelPermissionsResponse: LandsParcelPermissionsResponse = {
        owner: false,
        operator: true,
        updateOperator: false,
        updateManager: false,
        approvedForAll: false
      }

      mockFetch.mockResolvedValueOnce(mockParcelPermissionsResponse)

      const result = await landsComponent.getLandPermissions('0xUserAddress', ['50,60', '99,99'])
      expect(result).toEqual({
        owner: false,
        operator: true,
        updateOperator: false,
        updateManager: false,
        approvedForAll: false
      })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://lambdas.decentraland.org/api/users/0xuseraddress/parcels/50/60/permissions'
      )
    })

    it('should throw an error when permission response is not available', async () => {
      mockFetch.mockResolvedValueOnce(null)

      await expect(landsComponent.getLandPermissions('0xUserAddress', ['10,20'])).rejects.toThrow(
        'Land permissions not found for 0xUserAddress at 10,20'
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://lambdas.decentraland.org/api/users/0xuseraddress/parcels/10/20/permissions'
      )
    })

    it('should throw an error when lambdas URL is not set', async () => {
      const mockConfig = {
        requireString: jest.fn().mockResolvedValue(''),
        getString: jest.fn(),
        getNumber: jest.fn(),
        requireNumber: jest.fn()
      }

      const component = await createLandsComponent({
        landLease: createLandLeaseMock(),
        config: mockConfig,
        cachedFetch: {
          cache: jest.fn().mockReturnValue({
            fetch: jest.fn()
          })
        },
        logs: {
          getLogger: jest.fn().mockReturnValue({
            info: jest.fn(),
            error: jest.fn()
          })
        }
      })

      await expect(component.getLandPermissions('0xUserAddress', ['10,20'])).rejects.toThrow('Lambdas URL is not set')
    })
  })

  describe('getLandOperators', () => {
    it('should return owner and operator when both exist', async () => {
      const mockParcelOperatorsResponse: LandsParcelOperatorsResponse = {
        owner: '0xOwnerAddress',
        operator: '0xOperatorAddress',
        updateOperator: null,
        updateManagers: [],
        approvedForAll: []
      }

      mockFetch.mockResolvedValueOnce(mockParcelOperatorsResponse)

      const result = await landsComponent.getLandOperators('10,20')
      expect(result).toEqual({
        owner: '0xOwnerAddress',
        operator: '0xOperatorAddress',
        updateOperator: null,
        updateManagers: [],
        approvedForAll: []
      })
      expect(mockFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/parcels/10/20/operators')
    })

    it('should return update operator when update operator exists', async () => {
      const mockParcelOperatorsResponse: LandsParcelOperatorsResponse = {
        owner: '0xOwnerAddress',
        operator: null,
        updateOperator: '0xUpdateOperatorAddress',
        updateManagers: [],
        approvedForAll: []
      }

      mockFetch.mockResolvedValueOnce(mockParcelOperatorsResponse)

      const result = await landsComponent.getLandOperators('10,20')
      expect(result).toEqual({
        owner: '0xOwnerAddress',
        operator: null,
        updateOperator: '0xUpdateOperatorAddress',
        updateManagers: [],
        approvedForAll: []
      })
      expect(mockFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/parcels/10/20/operators')
    })

    it('should return update manager when update manager exists', async () => {
      const mockParcelOperatorsResponse: LandsParcelOperatorsResponse = {
        owner: '0xOwnerAddress',
        operator: null,
        updateOperator: null,
        updateManagers: ['0xUpdateManagerAddress'],
        approvedForAll: []
      }

      mockFetch.mockResolvedValueOnce(mockParcelOperatorsResponse)

      const result = await landsComponent.getLandOperators('10,20')
      expect(result).toEqual({
        owner: '0xOwnerAddress',
        operator: null,
        updateOperator: null,
        updateManagers: ['0xUpdateManagerAddress'],
        approvedForAll: []
      })
      expect(mockFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/parcels/10/20/operators')
    })

    it('should return approved for all when approved for all exists', async () => {
      const mockParcelOperatorsResponse: LandsParcelOperatorsResponse = {
        owner: '0xOwnerAddress',
        operator: null,
        updateOperator: null,
        updateManagers: [],
        approvedForAll: ['0xApprovedForAllAddress']
      }

      mockFetch.mockResolvedValueOnce(mockParcelOperatorsResponse)

      const result = await landsComponent.getLandOperators('10,20')
      expect(result).toEqual({
        owner: '0xOwnerAddress',
        operator: null,
        updateOperator: null,
        updateManagers: [],
        approvedForAll: ['0xApprovedForAllAddress']
      })
      expect(mockFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/parcels/10/20/operators')
    })

    it('should return only owner when operator does not exist', async () => {
      const mockParcelOperatorsResponse: LandsParcelOperatorsResponse = {
        owner: '0xOwnerAddress',
        operator: null,
        updateOperator: null,
        updateManagers: [],
        approvedForAll: []
      }

      mockFetch.mockResolvedValueOnce(mockParcelOperatorsResponse)

      const result = await landsComponent.getLandOperators('10,20')
      expect(result).toEqual({
        owner: '0xOwnerAddress',
        operator: null,
        updateOperator: null,
        updateManagers: [],
        approvedForAll: []
      })
      expect(mockFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/parcels/10/20/operators')
    })

    it('should throw an error when operators response is not available', async () => {
      mockFetch.mockResolvedValueOnce(null)

      await expect(landsComponent.getLandOperators('10,20')).rejects.toThrow('Land permissions not found for 10,20')
      expect(mockFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/parcels/10/20/operators')
    })

    it('should throw an error when lambdas URL is not set', async () => {
      const mockConfig = {
        requireString: jest.fn().mockResolvedValue(''),
        getString: jest.fn(),
        getNumber: jest.fn(),
        requireNumber: jest.fn()
      }

      const component = await createLandsComponent({
        landLease: createLandLeaseMock(),
        config: mockConfig,
        cachedFetch: {
          cache: jest.fn().mockReturnValue({
            fetch: jest.fn()
          })
        },
        logs: {
          getLogger: jest.fn().mockReturnValue({
            info: jest.fn(),
            error: jest.fn()
          })
        }
      })

      await expect(component.getLandOperators('10,20')).rejects.toThrow('Lambdas URL is not set')
    })
  })

  describe('getLeaseHoldersForParcels', () => {
    let landLease: jest.Mocked<ILandLeaseComponent>

    const buildComponent = async () =>
      createLandsComponent({
        landLease,
        config: {
          requireString: jest.fn().mockResolvedValue('https://lambdas.decentraland.org/api'),
          getString: jest.fn(),
          getNumber: jest.fn(),
          requireNumber: jest.fn()
        },
        cachedFetch: {
          cache: jest.fn().mockReturnValue({ fetch: jest.fn() })
        },
        logs: createLoggerMockedComponent()
      })

    beforeEach(() => {
      landLease = createLandLeaseMock()
    })

    describe('and no parcels are passed', () => {
      it('should return an empty array without querying authorizations', async () => {
        const component = await buildComponent()
        const result = await component.getLeaseHoldersForParcels([])
        expect(result).toEqual([])
        expect(landLease.getAuthorizations).not.toHaveBeenCalled()
      })
    })

    describe('and an authorization overlaps the requested parcels', () => {
      beforeEach(() => {
        landLease.getAuthorizations.mockResolvedValue({
          authorizations: [
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
          ]
        })
      })

      it('should return only the lowercased addresses for overlapping plots', async () => {
        const component = await buildComponent()
        const result = await component.getLeaseHoldersForParcels(['10,20', '11,20'])
        expect(new Set(result)).toEqual(new Set(['0xlease1', '0xlease2']))
      })
    })

    describe('and the lease lookup throws', () => {
      beforeEach(() => {
        landLease.getAuthorizations.mockRejectedValue(new Error('lease service unavailable'))
      })

      it('should swallow the error and return an empty array (failures must not poison callers)', async () => {
        const component = await buildComponent()
        const result = await component.getLeaseHoldersForParcels(['10,20'])
        expect(result).toEqual([])
      })
    })
  })

  describe('cache reuse with the real cachedFetch component', () => {
    let cachedFetchFetch: jest.Mock
    let cachedLandsComponent: Awaited<ReturnType<typeof createLandsComponent>>

    beforeEach(async () => {
      cachedFetchFetch = jest.fn()
      const realCachedFetch = await cachedFetchComponent({
        fetch: { fetch: cachedFetchFetch },
        logs: createLoggerMockedComponent()
      })

      const mockConfig = {
        requireString: jest.fn().mockResolvedValue('https://lambdas.decentraland.org/api'),
        getString: jest.fn(),
        getNumber: jest.fn(),
        requireNumber: jest.fn()
      }

      cachedLandsComponent = await createLandsComponent({
        landLease: createLandLeaseMock(),
        config: mockConfig,
        cachedFetch: realCachedFetch,
        logs: createLoggerMockedComponent()
      })
    })

    describe('and getLandPermissions is called twice for the same address and parcel', () => {
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

        await cachedLandsComponent.getLandPermissions('0xUserAddress', ['10,20'])
        await cachedLandsComponent.getLandPermissions('0xUserAddress', ['10,20'])
      })

      it('should call the upstream only once', () => {
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

        await cachedLandsComponent.getLandPermissions('0xUserAddress', ['10,20'])
        await cachedLandsComponent.getLandPermissions('0xuseraddress', ['10,20'])
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

        await cachedLandsComponent.getLandOperators('10,20')
        await cachedLandsComponent.getLandOperators('10,20')
      })

      it('should call the upstream only once', () => {
        expect(cachedFetchFetch).toHaveBeenCalledTimes(1)
      })
    })
  })
})
