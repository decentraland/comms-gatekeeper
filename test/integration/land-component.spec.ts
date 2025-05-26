import { createLandsComponent } from '../../src/adapters/lands'
import { LandsParcelPermissionsResponse, LandsParcelOperatorsResponse } from '../../src/types/lands.type'

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
        'https://lambdas.decentraland.org/api/users/0xUserAddress/parcels/10/20/permissions'
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
        'https://lambdas.decentraland.org/api/users/0xUserAddress/parcels/50/60/permissions'
      )
    })

    it('should throw an error when permission response is not available', async () => {
      mockFetch.mockResolvedValueOnce(null)

      await expect(landsComponent.getLandPermissions('0xUserAddress', ['10,20'])).rejects.toThrow(
        'Land permissions not found for 0xUserAddress at 10,20'
      )
      expect(mockFetch).toHaveBeenCalledWith(
        'https://lambdas.decentraland.org/api/users/0xUserAddress/parcels/10/20/permissions'
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
        updateOperators: null,
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
})
