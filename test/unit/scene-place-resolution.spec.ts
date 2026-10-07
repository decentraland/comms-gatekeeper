import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { createWorldsComponent } from '../../src/adapters/worlds'
import { createPlacesComponent } from '../../src/adapters/places'
import { IWorldComponent } from '../../src/types/worlds.type'
import { IPlacesComponent, PlaceAttributes } from '../../src/types/places.type'
import { InvalidRequestError } from '../../src/types/errors'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createFetchMockedComponent } from '../mocks/fetch-mock'
import { createCachedFetchMockedComponent } from '../mocks/cached-fetch'
import { createContentClientMockedComponent } from '../mocks/content-client-mock'
import { createMockedWorldPlace } from '../mocks/places-mock'

describe('when resolving a scene and its place with the real adapters', () => {
  let worlds: IWorldComponent
  let places: IPlacesComponent
  let fetch: ReturnType<typeof createFetchMockedComponent>
  let place: PlaceAttributes

  beforeEach(async () => {
    const config = createConfigMockedComponent({ requireString: jest.fn().mockResolvedValue('https://upstream') })
    const logs = createLoggerMockedComponent()
    fetch = createFetchMockedComponent()
    place = createMockedWorldPlace({ world_name: 'name.eth', positions: ['1,2'], base_position: '1,2' })
    worlds = await createWorldsComponent({ config, logs, fetch, cachedFetch: createCachedFetchMockedComponent() })
    places = await createPlacesComponent({
      config,
      logs,
      fetch,
      worlds,
      contentClient: createContentClientMockedComponent()
    })
    fetch.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ scenes: [{ entityId: 'scene-id', parcels: ['1,2'] }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [place] })))
  })

  afterEach(async () => {
    await worlds[STOP_COMPONENT]?.()
    jest.resetAllMocks()
  })

  describe.each([
    ['scene-id', '1,2'],
    ['NAME.ETH', '1,2'],
    ['scene-id', undefined]
  ])('and the request identifies %s at %s', (sceneId, parcel) => {
    it('should resolve the room identity and place with one scene lookup and one Places request', async () => {
      const result = await places.resolveScenePlace(sceneId, 'name.eth', parcel)
      expect(result.sceneId).toBe('scene-id')
      expect(result.place.id).toBe(place.id)
      expect(fetch.fetch).toHaveBeenCalledTimes(2)
      expect(fetch.fetch.mock.calls[0][0]).toContain('/world/name.eth/scenes')
      expect(fetch.fetch.mock.calls[1][0]).toContain('/places?positions=1%2C2&names=name.eth')
    })
  })

  describe('and the deployment changes before a subsequent operation', () => {
    beforeEach(() => {
      fetch.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ scenes: [{ entityId: 'new-id', parcels: ['1,2'] }] }))
      )
    })

    it('should reject the old deployment instead of reusing a cached result', async () => {
      await places.resolveScenePlace('scene-id', 'name.eth', '1,2')
      await expect(places.resolveScenePlace('scene-id', 'name.eth', '1,2')).rejects.toThrow(InvalidRequestError)
      expect(fetch.fetch).toHaveBeenCalledTimes(3)
    })
  })
})
