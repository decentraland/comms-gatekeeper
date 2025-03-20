import { createPlacesComponent } from '../../src/adapters/places'
import { PlaceNotFoundError } from '../../src/types'

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
    it('should return place when found by parcel', async () => {
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
      expect(result.id).toBe('some-id')
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places?positions=1,2')
    })

    it('should throw error when no place found for parcel', async () => {
      const mockEmptyResponse = { data: [], ok: true }
      mockFetch.mockResolvedValueOnce(mockEmptyResponse)

      await expect(placesComponent.getPlaceByParcel('10,20')).rejects.toThrow('No place found with parcel 10,20')
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places?positions=10,20')
    })
  })

  describe('getWorldByName', () => {
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

      const result = await placesComponent.getWorldByName('test-world')
      expect(result.id).toBe('world-id')
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/worlds?names=test-world')
    })

    it('should throw PlaceNotFoundError when world not found', async () => {
      const mockEmptyResponse = { data: [], ok: true }
      mockFetch.mockResolvedValueOnce(mockEmptyResponse)

      await expect(placesComponent.getWorldByName('nonexistent-world')).rejects.toThrow(PlaceNotFoundError)
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/worlds?names=nonexistent-world')
    })
  })

  describe('getPlace', () => {
    it('should return place data when world is requested', async () => {
      const mockWorldResponse = {
        data: [
          {
            id: 'world-detail-id',
            title: 'Test World',
            owner: '0xWorldOwner',
            description: 'Detailed World',
            positions: [],
            world_name: 'test-world'
          }
        ],
        ok: true
      }

      mockFetch.mockResolvedValueOnce(mockWorldResponse)

      const result = await placesComponent.getPlace(true, 'test-world', '0,0')
      expect(result.id).toBe('world-detail-id')
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/worlds?names=test-world')
    })

    it('should return place data when parcel is requested', async () => {
      const mockPlaceResponse = {
        data: [
          {
            id: 'place-detail-id',
            title: 'Test Place Detail',
            owner: '0xDetailOwner',
            description: 'Detailed Place',
            positions: ['5,6']
          }
        ],
        ok: true
      }

      mockFetch.mockResolvedValueOnce(mockPlaceResponse)

      const result = await placesComponent.getPlace(false, 'realm', '5,6')
      expect(result.id).toBe('place-detail-id')
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places?positions=5,6')
    })

    it('should throw PlaceNotFoundError when world not found', async () => {
      const mockEmptyResponse = { data: [], ok: true }
      mockFetch.mockResolvedValueOnce(mockEmptyResponse)

      await expect(placesComponent.getPlace(true, 'nonexistent-world', '0,0')).rejects.toThrow(PlaceNotFoundError)
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/worlds?names=nonexistent-world')
    })
  })
})
