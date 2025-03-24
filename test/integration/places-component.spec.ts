import { createPlacesComponent } from '../../src/adapters/places'
import { PlaceNotFoundError } from '../../src/types/errors'

describe('PlacesComponent', () => {
  let placesComponent: Awaited<ReturnType<typeof createPlacesComponent>>
  let mockFetch: jest.Mock

  beforeEach(async () => {
    jest.clearAllMocks()

    mockFetch = jest.fn()

    const mockConfig = {
      requireString: jest.fn().mockImplementation((key) => {
        const values = {
          PLACES_API_URL: 'https://places.decentraland.org/api'
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

    placesComponent = await createPlacesComponent({
      config: mockConfig,
      cachedFetch: mockCachedFetch,
      logs: mockLogs
    })
  })

  describe('getPlaceByParcel', () => {
    it('should return a place when found by parcel', async () => {
      const mockPlaceResponse = {
        data: [
          {
            id: 'some-id',
            title: 'Test Place',
            owner: '0xOwnerAddress',
            description: 'Test Description',
            positions: ['1,2']
          }
        ],
        ok: true
      }

      mockFetch.mockResolvedValueOnce(mockPlaceResponse)

      const result = await placesComponent.getPlaceByParcel('1,2')
      expect(result).toBe(mockPlaceResponse.data[0])
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places?positions=1,2')
    })

    it('should throw error when no place found for parcel', async () => {
      const mockEmptyResponse = { data: [], ok: true }
      mockFetch.mockResolvedValueOnce(mockEmptyResponse)

      await expect(placesComponent.getPlaceByParcel('10,20')).rejects.toThrow('No place found with parcel 10,20')
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places?positions=10,20')
    })
  })

  describe('getPlaceByWorldName', () => {
    it('should return world data when found', async () => {
      const mockWorldResponse = {
        data: [
          {
            id: 'world-id',
            title: 'Test World',
            owner: '0xOwnerAddress',
            description: 'World Description',
            positions: [],
            world_name: 'test-world'
          }
        ],
        ok: true
      }

      mockFetch.mockResolvedValueOnce(mockWorldResponse)

      const result = await placesComponent.getPlaceByWorldName('test-world')
      expect(result).toBe(mockWorldResponse.data[0])
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/worlds?names=test-world')
    })

    it('should throw PlaceNotFoundError when world not found', async () => {
      const mockEmptyResponse = { data: [], ok: true }
      mockFetch.mockResolvedValueOnce(mockEmptyResponse)

      await expect(placesComponent.getPlaceByWorldName('nonexistent-world')).rejects.toThrow(PlaceNotFoundError)
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/worlds?names=nonexistent-world')
    })
  })
})
