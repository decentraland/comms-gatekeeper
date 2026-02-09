import { createPlacesComponent } from '../../src/adapters/places'
import { PlaceNotFoundError } from '../../src/types/errors'
import { PlaceAttributes, PlaceResponse } from '../../src/types/places.type'

describe('PlacesComponent', () => {
  let placesComponent: Awaited<ReturnType<typeof createPlacesComponent>>
  let mockFetch: jest.Mock

  beforeEach(async () => {
    jest.clearAllMocks()

    mockFetch = jest.fn()
    const mockFetchComponent = { fetch: mockFetch }

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
      logs: mockLogs,
      fetch: mockFetchComponent
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

  describe('getWorldByName', () => {
    it('should return world data when found', async () => {
      const mockWorldData = {
        id: 'world-id',
        title: 'Test World',
        owner: '0xOwnerAddress',
        description: 'World Description',
        positions: [],
        world_name: 'test-world'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockWorldData, ok: true })
      })

      const result = await placesComponent.getWorldByName('test-world')
      expect(result).toEqual(mockWorldData)
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/worlds/test-world')
    })

    it('should lowercase the world name in the URL', async () => {
      const mockWorldData = {
        id: 'world-id',
        title: 'Test World',
        owner: '0xOwnerAddress',
        description: 'World Description',
        positions: [],
        world_name: 'Test-World'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockWorldData, ok: true })
      })

      const result = await placesComponent.getWorldByName('Test-World')
      expect(result).toEqual(mockWorldData)
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/worlds/test-world')
    })

    it('should throw PlaceNotFoundError when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })

      await expect(placesComponent.getWorldByName('nonexistent-world')).rejects.toThrow(PlaceNotFoundError)
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/worlds/nonexistent-world')
    })

    it('should throw PlaceNotFoundError when world data is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: null, ok: true })
      })

      await expect(placesComponent.getWorldByName('nonexistent-world')).rejects.toThrow(PlaceNotFoundError)
    })
  })

  describe('getWorldScenePlace', () => {
    it('should return world scene place when found', async () => {
      const mockPlaceResponse = {
        data: [
          {
            id: 'scene-place-id',
            title: 'World Scene',
            owner: '0xOwnerAddress',
            description: 'A scene in a world',
            positions: ['10,20'],
            world_name: 'test-world'
          }
        ],
        ok: true
      }

      mockFetch.mockResolvedValueOnce(mockPlaceResponse)

      const result = await placesComponent.getWorldScenePlace('test-world', '10,20')
      expect(result).toBe(mockPlaceResponse.data[0])
      expect(mockFetch).toHaveBeenCalledWith(
        'https://places.decentraland.org/api/places?positions=10,20&names=test-world'
      )
    })

    it('should lowercase the world name in the URL', async () => {
      const mockPlaceResponse = {
        data: [
          {
            id: 'scene-place-id',
            title: 'World Scene',
            owner: '0xOwnerAddress',
            positions: ['10,20'],
            world_name: 'Test-World'
          }
        ],
        ok: true
      }

      mockFetch.mockResolvedValueOnce(mockPlaceResponse)

      const result = await placesComponent.getWorldScenePlace('Test-World', '10,20')
      expect(result).toBe(mockPlaceResponse.data[0])
      expect(mockFetch).toHaveBeenCalledWith(
        'https://places.decentraland.org/api/places?positions=10,20&names=test-world'
      )
    })

    it('should throw PlaceNotFoundError when no scene place found', async () => {
      const mockEmptyResponse = { data: [], ok: true }
      mockFetch.mockResolvedValueOnce(mockEmptyResponse)

      await expect(placesComponent.getWorldScenePlace('test-world', '10,20')).rejects.toThrow(PlaceNotFoundError)
    })
  })

  describe('getPlaceStatusByIds', () => {
    it('should return place statuses for given ids', async () => {
      const mockResponse = {
        data: [
          { id: '1', disabled: false },
          { id: '2', disabled: true }
        ]
      }

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse)
      })

      const result = await placesComponent.getPlaceStatusByIds(['1', '2'])

      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['1', '2'])
      })

      expect(result).toEqual([
        { id: '1', disabled: false },
        { id: '2', disabled: true }
      ])
    })

    it('should throw PlaceNotFoundError when no places are found', async () => {
      const mockResponse = {
        data: []
      }

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(mockResponse)
      })

      await expect(placesComponent.getPlaceStatusByIds(['1', '2'])).rejects.toThrow(PlaceNotFoundError)

      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['1', '2'])
      })
    })
  })
})
