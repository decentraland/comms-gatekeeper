import { createLandsComponent } from '../../src/adapters/lands'

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

  describe('hasLandUpdatePermission', () => {
    it('should return true when user has permission', async () => {
      const mockLandResponse = {
        elements: [
          { category: 'parcel', x: '10', y: '20' },
          { category: 'parcel', x: '30', y: '40' }
        ]
      }

      mockFetch.mockResolvedValueOnce(mockLandResponse)

      const result = await landsComponent.hasLandUpdatePermission('0xUserAddress', ['10,20', '99,99'])
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/users/0xUserAddress/lands')
    })

    it('should return false when user does not have permission', async () => {
      const mockLandResponse = {
        elements: [
          { category: 'parcel', x: '10', y: '20' },
          { category: 'parcel', x: '30', y: '40' }
        ]
      }

      mockFetch.mockResolvedValueOnce(mockLandResponse)

      const result = await landsComponent.hasLandUpdatePermission('0xUserAddress', ['50,60', '99,99'])
      expect(result).toBe(false)
      expect(mockFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/users/0xUserAddress/lands')
    })

    it('should return false when user has no lands', async () => {
      const mockEmptyResponse = {
        elements: []
      }

      mockFetch.mockResolvedValueOnce(mockEmptyResponse)

      const result = await landsComponent.hasLandUpdatePermission('0xUserAddress', ['10,20'])
      expect(result).toBe(false)
      expect(mockFetch).toHaveBeenCalledWith('https://lambdas.decentraland.org/api/users/0xUserAddress/lands')
    })

    it('should return false when positions array is empty', async () => {
      const result = await landsComponent.hasLandUpdatePermission('0xUserAddress', [])
      expect(result).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
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
            info: jest.fn()
          })
        }
      })

      await expect(component.hasLandUpdatePermission('0xUserAddress', ['10,20'])).rejects.toThrow(
        'Lambdas URL is not set'
      )
    })
  })
})
