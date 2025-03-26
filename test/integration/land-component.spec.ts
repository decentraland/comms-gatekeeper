import { createLandsComponent } from '../../src/adapters/lands'
import { LandsParcelPermissionsResponse } from '../../src/types/land.type'

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
        operator: false
      }

      mockFetch.mockResolvedValueOnce(mockParcelPermissionsResponse)

      const result = await landsComponent.getLandUpdatePermission('0xUserAddress', ['10,20', '99,99'])
      expect(result.owner).toBe(true)
      expect(result.operator).toBe(false)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://lambdas.decentraland.org/api/users/0xUserAddress/parcels/10/20/permissions'
      )
    })

    it('should return operator=true when user has operator permission', async () => {
      const mockParcelPermissionsResponse: LandsParcelPermissionsResponse = {
        owner: false,
        operator: true
      }

      mockFetch.mockResolvedValueOnce(mockParcelPermissionsResponse)

      const result = await landsComponent.getLandUpdatePermission('0xUserAddress', ['50,60', '99,99'])
      expect(result.owner).toBe(false)
      expect(result.operator).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://lambdas.decentraland.org/api/users/0xUserAddress/parcels/50/60/permissions'
      )
    })

    it('should throw an error when permission response is not available', async () => {
      mockFetch.mockResolvedValueOnce(null)

      await expect(landsComponent.getLandUpdatePermission('0xUserAddress', ['10,20'])).rejects.toThrow(
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
            info: jest.fn()
          })
        }
      })

      await expect(component.getLandUpdatePermission('0xUserAddress', ['10,20'])).rejects.toThrow(
        'Lambdas URL is not set'
      )
    })
  })
})
