import { createMockedPlace, createMockedWorldPlace } from '../mocks/places-mock'
import { InvalidRequestError, ServiceUnavailableError } from '../../src/types/errors'
import { cachedFetchComponent } from '../../src/adapters/fetch'
import { createPlacesComponent } from '../../src/adapters/places'
import { PlaceNotFoundError } from '../../src/types/errors'
import { PlaceAttributes, PlaceResponse } from '../../src/types/places.type'

describe('PlacesComponent', () => {
  let placesComponent: Awaited<ReturnType<typeof createPlacesComponent>>
  let mockFetch: jest.Mock
  let mockWorlds: any
  let mockContentClient: any

  beforeEach(async () => {
    jest.clearAllMocks()

    mockFetch = jest.fn()
    const mockFetchComponent = {
      fetch: jest.fn(async (url, options) => {
        const response = await (options?.method ? mockFetch(url, options) : mockFetch(url))
        return response?.json || response?.ok === false ? response : { ok: true, json: async () => response }
      })
    }

    const mockConfig = {
      requireString: jest.fn().mockImplementation((key) => {
        const values = {
          PLACES_API_URL: 'https://places.decentraland.org/api'
        }
        return Promise.resolve(values[key] || '')
      }),
      getString: jest.fn(),
      getNumber: jest.fn().mockImplementation(async (key) => (key === 'PLACES_CACHE_TTL_MS' ? 20 : undefined)),
      requireNumber: jest.fn()
    }

    const mockLogs = {
      getLogger: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      })
    }

    mockWorlds = {
      fetchWorldSceneEntityMetadataById: jest.fn(),
      fetchWorldSceneByEntityId: jest.fn(),
      fetchWorldSceneByPointer: jest.fn(),
      resolveWorldSceneId: jest.fn()
    }

    mockContentClient = {
      fetchEntityById: jest.fn(),
      fetchEntitiesByPointers: jest.fn().mockResolvedValue([{ id: 'bafkreiscene123' }])
    }

    placesComponent = await createPlacesComponent({
      config: mockConfig,
      cachedFetch: await cachedFetchComponent({ fetch: mockFetchComponent, logs: mockLogs }),
      logs: mockLogs,
      fetch: mockFetchComponent,
      worlds: mockWorlds,
      contentClient: mockContentClient
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
            positions: ['1,2'],
            disabled: false,
            world: false
          }
        ],
        ok: true
      }

      mockFetch.mockResolvedValueOnce(mockPlaceResponse)

      const result = await placesComponent.getPlaceByParcel('1,2')
      expect(result).toBe(mockPlaceResponse.data[0])
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places?positions=1%2C2')
    })

    it('should throw error when no place found for parcel', async () => {
      const mockEmptyResponse = { data: [], ok: true }
      mockFetch.mockResolvedValueOnce(mockEmptyResponse)

      await expect(placesComponent.getPlaceByParcel('10,20')).rejects.toThrow('No place found with parcel 10,20')
      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places?positions=10%2C20')
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
            world_name: 'test-world',
            disabled: false,
            world: true
          }
        ],
        ok: true
      }

      mockFetch.mockResolvedValueOnce(mockPlaceResponse)

      const result = await placesComponent.getWorldScenePlace('test-world', '10,20')
      expect(result).toBe(mockPlaceResponse.data[0])
      expect(mockFetch).toHaveBeenCalledWith(
        'https://places.decentraland.org/api/places?positions=10%2C20&names=test-world&include_opted_out=true'
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
            world_name: 'Test-World',
            disabled: false,
            world: true
          }
        ],
        ok: true
      }

      mockFetch.mockResolvedValueOnce(mockPlaceResponse)

      const result = await placesComponent.getWorldScenePlace('Test-World', '10,20')
      expect(result).toBe(mockPlaceResponse.data[0])
      expect(mockFetch).toHaveBeenCalledWith(
        'https://places.decentraland.org/api/places?positions=10%2C20&names=test-world&include_opted_out=true'
      )
    })

    it('should throw PlaceNotFoundError when no scene place found', async () => {
      const mockEmptyResponse = { data: [], ok: true }
      mockFetch.mockResolvedValueOnce(mockEmptyResponse)

      await expect(placesComponent.getWorldScenePlace('test-world', '10,20')).rejects.toThrow(PlaceNotFoundError)
    })
  })

  describe('when getting a world scene place by entity id', () => {
    const worldName = 'test-world'
    const entityId = 'bafkrei123'

    describe('and the worlds content server returns valid scene entity metadata', () => {
      let result: PlaceAttributes
      let mockPlaceResponse: PlaceResponse

      beforeEach(async () => {
        mockWorlds.fetchWorldSceneByEntityId.mockResolvedValue({
          worldName,
          entityId,
          deployer: '0xdeployer',
          parcels: ['10,20', '10,21'],
          baseParcel: '10,20'
        })

        mockPlaceResponse = {
          data: [
            {
              id: 'scene-place-id',
              title: 'World Scene',
              owner: '0xOwnerAddress',
              positions: ['10,20', '10,21'],
              world_name: worldName,
              disabled: false,
              world: true
            } as PlaceAttributes
          ],
          ok: true,
          total: 1
        }
        mockFetch.mockResolvedValueOnce(mockPlaceResponse)

        result = await placesComponent.getWorldScenePlaceByEntityId(worldName, entityId)
      })

      it('should fetch the scene entity metadata from the worlds content server', () => {
        expect(mockWorlds.fetchWorldSceneByEntityId).toHaveBeenCalledWith(worldName, entityId)
      })

      it('should query the places API with the base parcel and world name', () => {
        expect(mockFetch).toHaveBeenCalledWith(
          'https://places.decentraland.org/api/places?positions=10%2C20&names=test-world&include_opted_out=true'
        )
      })

      it('should return the place', () => {
        expect(result).toBe(mockPlaceResponse.data[0])
      })
    })

    describe('and the declared base is outside the scene parcels', () => {
      beforeEach(() => {
        mockWorlds.fetchWorldSceneByEntityId.mockResolvedValue(undefined)
      })

      it('should reject the unbound scene metadata', async () => {
        await expect(placesComponent.getWorldScenePlaceByEntityId(worldName, entityId)).rejects.toThrow(
          PlaceNotFoundError
        )
      })
    })

    describe('and the worlds content server returns no scene entity metadata', () => {
      beforeEach(() => {
        mockWorlds.fetchWorldSceneByEntityId.mockResolvedValue(undefined)
      })

      it('should throw PlaceNotFoundError', async () => {
        await expect(placesComponent.getWorldScenePlaceByEntityId(worldName, entityId)).rejects.toThrow(
          PlaceNotFoundError
        )
      })

      it('should not query the places API', async () => {
        await expect(placesComponent.getWorldScenePlaceByEntityId(worldName, entityId)).rejects.toThrow()
        expect(mockFetch).not.toHaveBeenCalled()
      })
    })

    describe('and the scene entity metadata has no base parcel', () => {
      beforeEach(() => {
        mockWorlds.fetchWorldSceneByEntityId.mockResolvedValue(undefined)
      })

      it('should throw PlaceNotFoundError', async () => {
        await expect(placesComponent.getWorldScenePlaceByEntityId(worldName, entityId)).rejects.toThrow(
          PlaceNotFoundError
        )
      })
    })
  })

  describe('getPlaceBySceneId', () => {
    const sceneId = 'bafkreiscene123'

    describe('and no world name is given (Genesis City scene)', () => {
      let result: PlaceAttributes
      let mockPlaceResponse: PlaceResponse

      beforeEach(async () => {
        mockContentClient.fetchEntityById.mockResolvedValue({
          id: sceneId,
          pointers: ['10,20'],
          metadata: { scene: { base: '10,20', parcels: ['10,20'] } }
        })
        mockPlaceResponse = {
          data: [
            {
              id: 'genesis-place-id',
              title: 'Genesis Scene',
              positions: ['10,20'],
              disabled: false,
              world: false
            } as PlaceAttributes
          ],
          ok: true,
          total: 1
        }
        mockFetch.mockResolvedValueOnce(mockPlaceResponse)

        result = await placesComponent.getPlaceBySceneId(sceneId)
      })

      it('should resolve the scene entity through the catalyst content client', () => {
        expect(mockContentClient.fetchEntityById).toHaveBeenCalledWith(sceneId)
      })

      it("should query the places API with the entity's base parcel", () => {
        expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places?positions=10%2C20')
      })

      it('should return the place', () => {
        expect(result).toBe(mockPlaceResponse.data[0])
      })
    })

    describe('and the Genesis entity uses a non-canonical pointer', () => {
      beforeEach(() => {
        mockContentClient.fetchEntityById.mockResolvedValue({
          id: sceneId,
          pointers: ['010,20'],
          metadata: { scene: { base: '10,20', parcels: ['10,20'] } }
        })
      })

      it('should reject the unbound scene identity', async () => {
        await expect(placesComponent.getPlaceBySceneId(sceneId)).rejects.toThrow(PlaceNotFoundError)
      })
    })

    describe('and a world name is given (world scene)', () => {
      const worldName = 'test-world'
      let result: PlaceAttributes
      let mockPlaceResponse: PlaceResponse

      beforeEach(async () => {
        // Multi-scene worlds: each scene has its own entity id and base parcel, so the world
        // content server maps this sceneId to its specific base parcel, and the Places API
        // returns the place for that scene within the world.
        mockWorlds.fetchWorldSceneByEntityId.mockResolvedValue({
          worldName,
          entityId: sceneId,
          deployer: '0xdeployer',
          parcels: ['5,5'],
          baseParcel: '5,5'
        })
        mockPlaceResponse = {
          data: [
            {
              id: 'world-scene-place',
              title: 'World Scene B',
              positions: ['5,5'],
              world_name: worldName,
              disabled: false,
              world: true
            } as PlaceAttributes
          ],
          ok: true,
          total: 1
        }
        mockFetch.mockResolvedValueOnce(mockPlaceResponse)

        result = await placesComponent.getPlaceBySceneId(sceneId, worldName)
      })

      it('should resolve the scene through the worlds content server, not the catalyst content client', () => {
        expect(mockWorlds.fetchWorldSceneByEntityId).toHaveBeenCalledWith(worldName, sceneId)
        expect(mockContentClient.fetchEntityById).not.toHaveBeenCalled()
      })

      it("should query the places API scoped to the scene's base parcel and world name", () => {
        expect(mockFetch).toHaveBeenCalledWith(
          'https://places.decentraland.org/api/places?positions=5%2C5&names=test-world&include_opted_out=true'
        )
      })

      it('should return the specific scene place within the world', () => {
        expect(result).toBe(mockPlaceResponse.data[0])
      })
    })

    describe('and the scene entity cannot be resolved', () => {
      beforeEach(() => {
        mockContentClient.fetchEntityById.mockResolvedValue(undefined)
      })

      it('should throw PlaceNotFoundError', async () => {
        await expect(placesComponent.getPlaceBySceneId(sceneId)).rejects.toThrow(PlaceNotFoundError)
      })
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
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await placesComponent.getPlaceStatusByIds(['1', '2'])

      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['1', '2']),
        signal: expect.any(AbortSignal)
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
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      await expect(placesComponent.getPlaceStatusByIds(['1', '2'])).rejects.toThrow(PlaceNotFoundError)

      expect(mockFetch).toHaveBeenCalledWith('https://places.decentraland.org/api/places/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['1', '2']),
        signal: expect.any(AbortSignal)
      })
    })
  })
  describe('when selecting an opted-out world scene', () => {
    let selectedPlace: PlaceAttributes

    beforeEach(() => {
      selectedPlace = createMockedWorldPlace({
        id: 'opted-out',
        world_name: 'name.eth',
        positions: ['1,2'],
        disabled: true,
        disabled_reason: 'opt_out'
      })
      mockFetch.mockResolvedValueOnce({
        data: [
          createMockedPlace({ positions: ['1,2'] }),
          createMockedWorldPlace({ world_name: 'other.eth', positions: ['1,2'] }),
          createMockedWorldPlace({ world_name: 'name.eth', positions: ['2,3'] }),
          selectedPlace
        ]
      })
    })

    it('should retain access to the matching opted-out scene', async () => {
      await expect(placesComponent.getWorldScenePlace('NAME.ETH', '1,2')).resolves.toBe(selectedPlace)
    })
  })

  describe('when the matching place was removed', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        data: [
          createMockedWorldPlace({
            world_name: 'name.eth',
            positions: ['1,2'],
            disabled: true,
            disabled_reason: 'undeployment'
          })
        ]
      })
    })

    it('should not authorize against the removed place', async () => {
      await expect(placesComponent.getWorldScenePlace('name.eth', '1,2')).rejects.toThrow(PlaceNotFoundError)
    })
  })

  describe('when a world request supplies a different deployment from the signed parcel', () => {
    beforeEach(() => {
      mockWorlds.fetchWorldSceneByPointer.mockResolvedValueOnce({ entityId: 'other-scene', parcels: ['1,2'] })
    })

    it('should reject instead of looking up permissions for another scene', async () => {
      await expect(placesComponent.getPlaceBySceneId('scene-id', 'name.eth', '1,2')).rejects.toThrow(PlaceNotFoundError)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('when a Genesis request supplies a parcel outside the deployment', () => {
    beforeEach(() => {
      mockContentClient.fetchEntityById.mockResolvedValueOnce({
        id: 'scene-id',
        pointers: ['1,2'],
        metadata: { scene: { base: '1,2', parcels: ['1,2'] } }
      })
    })

    it('should reject before looking up permissions', async () => {
      await expect(placesComponent.getPlaceBySceneId('scene-id', undefined, '2,3')).rejects.toThrow(PlaceNotFoundError)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('when a world lookup omits the parcel', () => {
    describe('and the world has one unambiguous scene', () => {
      let selectedPlace: PlaceAttributes

      beforeEach(() => {
        selectedPlace = createMockedWorldPlace({ world_name: 'name.eth', positions: ['1,2'] })
        mockWorlds.resolveWorldSceneId.mockResolvedValueOnce('scene-id')
        mockWorlds.fetchWorldSceneByEntityId.mockResolvedValueOnce({
          entityId: 'scene-id',
          baseParcel: '1,2',
          parcels: ['1,2']
        })
        mockFetch.mockResolvedValueOnce({ data: [selectedPlace] })
      })

      it('should resolve its scene place for legacy watchers', async () => {
        await expect(placesComponent.getWorldScenePlace('name.eth')).resolves.toBe(selectedPlace)
      })
    })

    describe('and the world has multiple scenes', () => {
      beforeEach(() => {
        mockWorlds.resolveWorldSceneId.mockRejectedValueOnce(new InvalidRequestError('A parcel is required'))
      })

      it('should reject instead of selecting the first scene', async () => {
        await expect(placesComponent.getWorldScenePlace('name.eth')).rejects.toThrow(InvalidRequestError)
        expect(mockFetch).not.toHaveBeenCalled()
      })
    })
  })
  describe('when a Genesis deployment has been superseded', () => {
    beforeEach(() => {
      mockContentClient.fetchEntityById.mockResolvedValue({
        id: 'old-deployment',
        pointers: ['1,2'],
        metadata: { scene: { base: '1,2', parcels: ['1,2'] } }
      })
      mockContentClient.fetchEntitiesByPointers.mockResolvedValue([{ id: 'new-deployment' }])
      mockFetch.mockResolvedValue({ data: [createMockedPlace({ positions: ['1,2'] })] })
    })

    it('should reject mutations against the old deployment', async () => {
      await expect(placesComponent.getPlaceBySceneId('old-deployment')).rejects.toThrow(PlaceNotFoundError)
      expect(mockContentClient.fetchEntitiesByPointers).toHaveBeenCalledWith(['1,2'], {
        skipCache: true,
        expectedEntityId: 'old-deployment'
      })
    })

    it('should retain join compatibility for a validated previous deployment', async () => {
      await expect(
        placesComponent.getPlaceBySceneId('old-deployment', undefined, undefined, { allowPreviousDeployment: true })
      ).resolves.toMatchObject({ positions: ['1,2'] })
    })
  })

  describe('when Places data changes between requests', () => {
    beforeEach(() => {
      mockFetch
        .mockResolvedValueOnce({ data: [createMockedPlace({ id: 'old-place', positions: ['1,2'] })] })
        .mockResolvedValueOnce({ data: [createMockedPlace({ id: 'new-place', positions: ['1,2'] })] })
    })

    it('should reuse the place until expiration, then fetch the changed place', async () => {
      await expect(placesComponent.getPlaceByParcel('1,2')).resolves.toMatchObject({ id: 'old-place' })
      await expect(placesComponent.getPlaceByParcel('1,2')).resolves.toMatchObject({ id: 'old-place' })
      await new Promise((resolve) => setTimeout(resolve, 30))
      await expect(placesComponent.getPlaceByParcel('1,2')).resolves.toMatchObject({ id: 'new-place' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
  describe('when refreshing an older world room after a redeploy', () => {
    beforeEach(() => {
      mockWorlds.fetchWorldSceneByEntityId.mockResolvedValueOnce(undefined)
      mockWorlds.fetchWorldSceneEntityMetadataById.mockResolvedValueOnce({
        worldConfiguration: { name: 'name.eth' },
        scene: { base: '1,2', parcels: ['1,2'] }
      })
      mockWorlds.resolveWorldSceneId.mockResolvedValueOnce('old-deployment')
      mockFetch.mockResolvedValueOnce({
        data: [createMockedWorldPlace({ id: 'current-place', world_name: 'name.eth', positions: ['1,2'] })]
      })
    })

    it('should verify its old deployment footprint before resolving the current place for ban metadata', async () => {
      await expect(
        placesComponent.getWorldScenePlaceByEntityId('name.eth', 'old-deployment', { allowPreviousDeployment: true })
      ).resolves.toMatchObject({ id: 'current-place' })
      expect(mockWorlds.resolveWorldSceneId).toHaveBeenCalledWith('name.eth', 'old-deployment', '1,2', {
        allowPreviousDeployment: true
      })
    })
  })
  describe('when a valid Genesis scene has no indexed Places entry', () => {
    beforeEach(() => {
      mockContentClient.fetchEntityById.mockResolvedValue({
        id: 'genesis',
        pointers: ['1,2'],
        metadata: { scene: { base: '1,2', parcels: ['1,2'] } }
      })
      mockFetch.mockResolvedValue({ data: [] })
    })

    it('should allow a join without granting place permissions', async () => {
      await expect(
        placesComponent.resolveScenePlace('genesis', undefined, undefined, {
          allowPreviousDeployment: true,
          allowMissingPlace: true
        })
      ).resolves.toEqual({ sceneId: 'genesis', place: undefined })
    })

    it('should reject an entity with an unrelated identity even on the join path', async () => {
      await expect(
        placesComponent.resolveScenePlace('forged', undefined, undefined, {
          allowPreviousDeployment: true,
          allowMissingPlace: true
        })
      ).rejects.toThrow(PlaceNotFoundError)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    describe('and Places is unavailable', () => {
      beforeEach(() => {
        mockFetch.mockRejectedValue(new Error('outage'))
      })
      it('should propagate the outage instead of treating it as an absent place', async () => {
        await expect(
          placesComponent.resolveScenePlace('genesis', undefined, undefined, {
            allowPreviousDeployment: true,
            allowMissingPlace: true
          })
        ).rejects.toThrow(ServiceUnavailableError)
      })
    })
  })
})
