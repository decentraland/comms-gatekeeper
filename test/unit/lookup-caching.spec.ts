import { createLandsComponent, ILandComponent } from '../../src/adapters/lands'
import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { createWorldsComponent } from '../../src/adapters/worlds'
import { createPlacesComponent } from '../../src/adapters/places'
import { cachedFetchComponent } from '../../src/adapters/fetch'
import { IWorldComponent } from '../../src/types/worlds.type'
import { IPlacesComponent } from '../../src/types/places.type'
import { ServiceUnavailableError } from '../../src/types/errors'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createFetchMockedComponent } from '../mocks/fetch-mock'
import { createContentClientMockedComponent } from '../mocks/content-client-mock'
import { createMockedPlace } from '../mocks/places-mock'

describe('when upstream lookups use short-lived shared caches', () => {
  let lands: ILandComponent
  let worlds: IWorldComponent
  let places: IPlacesComponent
  let fetch: ReturnType<typeof createFetchMockedComponent>
  let now: number

  beforeEach(async () => {
    now = 1000
    jest.useFakeTimers({ doNotFake: ['performance'] })
    jest.spyOn(performance, 'now').mockImplementation(() => now)
    const config = createConfigMockedComponent({ requireString: jest.fn().mockResolvedValue('https://upstream') })
    const logs = createLoggerMockedComponent()
    fetch = createFetchMockedComponent()
    const cachedFetch = await cachedFetchComponent({ fetch, logs })
    lands = await createLandsComponent({ config, logs, fetch, cachedFetch })
    worlds = await createWorldsComponent({ config, logs, fetch, cachedFetch })
    places = await createPlacesComponent({
      config,
      logs,
      fetch,
      cachedFetch,
      worlds,
      contentClient: createContentClientMockedComponent()
    })
  })

  afterEach(async () => {
    await worlds[STOP_COMPONENT]?.()
    await places[STOP_COMPONENT]?.()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  describe('and several callers resolve the same world parcel', () => {
    beforeEach(() => {
      fetch.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ scenes: [{ entityId: 'old-id', parcels: ['1,2'] }] })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ scenes: [{ entityId: 'new-id', parcels: ['1,2'] }] })))
    })

    it('should share the concurrent lookup and refresh after five seconds', async () => {
      await Promise.all([
        worlds.resolveWorldSceneId('NAME.ETH', 'name.eth', '1,2'),
        worlds.resolveWorldSceneId('name.eth', 'name.eth', '1,2')
      ])
      await expect(worlds.resolveWorldSceneId('name.eth', 'name.eth', '1,2')).resolves.toBe('old-id')
      expect(fetch.fetch).toHaveBeenCalledTimes(1)
      now += 5001
      jest.advanceTimersByTime(2)
      await expect(worlds.resolveWorldSceneId('name.eth', 'name.eth', '1,2')).resolves.toBe('new-id')
      expect(fetch.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('and callers query different worlds, parcels or deployment IDs', () => {
    beforeEach(() => {
      fetch.fetch.mockImplementation(
        async () => new Response(JSON.stringify({ scenes: [{ entityId: 'scene-id', parcels: ['1,2', '3,4'] }] }))
      )
    })

    it('should keep each lookup key separate', async () => {
      await worlds.fetchWorldSceneByPointer('one.eth', '1,2')
      await worlds.fetchWorldSceneByPointer('two.eth', '1,2')
      await worlds.fetchWorldSceneByPointer('one.eth', '3,4')
      await worlds.fetchWorldSceneByEntityId('one.eth', 'scene-id')
      await worlds.fetchWorldSceneByEntityId('one.eth', 'other-id')
      expect(fetch.fetch).toHaveBeenCalledTimes(5)
    })
  })

  describe('and callers resolve a legacy world without a parcel', () => {
    beforeEach(() => {
      fetch.fetch.mockImplementation(
        async () =>
          new Response(JSON.stringify({ configurations: { scenesUrn: ['urn:decentraland:entity:scene-id'] } }))
      )
    })

    it('should reuse about for five seconds', async () => {
      await worlds.resolveWorldSceneId('name.eth', 'name.eth')
      await worlds.resolveWorldSceneId('NAME.ETH', 'NAME.ETH')
      expect(fetch.fetch).toHaveBeenCalledTimes(1)
      now += 5001
      jest.advanceTimersByTime(2)
      await worlds.resolveWorldSceneId('name.eth', 'name.eth')
      expect(fetch.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('and a cached world scene expires during an outage', () => {
    beforeEach(() => {
      fetch.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ scenes: [{ entityId: 'scene-id', parcels: ['1,2'] }] })))
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ scenes: [{ entityId: 'new-id', parcels: ['1,2'] }] })))
    })

    it('should reject stale authorization data and retry the upstream on the next call', async () => {
      await worlds.fetchWorldSceneByPointer('name.eth', '1,2')
      now += 5001
      jest.advanceTimersByTime(2)
      await expect(worlds.fetchWorldSceneByPointer('name.eth', '1,2')).rejects.toThrow(ServiceUnavailableError)
      await expect(worlds.fetchWorldSceneByPointer('name.eth', '1,2')).resolves.toMatchObject({ entityId: 'new-id' })
      expect(fetch.fetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('and world parcel permissions are requested', () => {
    beforeEach(() => {
      fetch.fetch.mockImplementation(async () => new Response(JSON.stringify({ parcels: ['1,2'] })))
    })

    it('should deduplicate the same permission but separate addresses and permission types', async () => {
      await Promise.all([
        worlds.getWorldParcelPermissions('0xABC', 'NAME.ETH', 'streaming'),
        worlds.getWorldParcelPermissions('0xabc', 'name.eth', 'streaming')
      ])
      await worlds.getWorldParcelPermissions('0xabc', 'name.eth', 'deployment')
      await worlds.getWorldParcelPermissions('0xdef', 'name.eth', 'streaming')
      expect(fetch.fetch).toHaveBeenCalledTimes(3)
      now += 10001
      jest.advanceTimersByTime(2)
      await worlds.getWorldParcelPermissions('0xabc', 'name.eth', 'streaming')
      expect(fetch.fetch).toHaveBeenCalledTimes(4)
    })
  })

  describe('and the same set of parcels is used to list permission addresses', () => {
    beforeEach(() => {
      fetch.fetch.mockImplementation(async () => new Response(JSON.stringify({ addresses: ['0xabc'] })))
    })

    it('should share the POST lookup irrespective of parcel order', async () => {
      await Promise.all([
        worlds.getWorldParcelPermissionAddresses('name.eth', 'deployment', ['1,2', '3,4']),
        worlds.getWorldParcelPermissionAddresses('NAME.ETH', 'deployment', ['3,4', '1,2'])
      ])
      expect(fetch.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('and a place changes after ten seconds', () => {
    beforeEach(() => {
      fetch.fetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: [createMockedPlace({ id: 'old-place', positions: ['1,2'] })] }))
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: [createMockedPlace({ id: 'new-place', positions: ['1,2'] })] }))
        )
    })

    it('should reuse concurrent lookups and observe the changed place after expiration', async () => {
      await Promise.all([places.getPlaceByParcel('1,2'), places.getPlaceByParcel('1,2')])
      expect(fetch.fetch).toHaveBeenCalledTimes(1)
      now += 10001
      jest.advanceTimersByTime(2)
      await expect(places.getPlaceByParcel('1,2')).resolves.toMatchObject({ id: 'new-place' })
    })
  })

  describe('and place-status batches contain different IDs', () => {
    beforeEach(() => {
      fetch.fetch.mockImplementation(async () => new Response(JSON.stringify({ data: [createMockedPlace()] })))
    })

    it('should share equal batches but never reuse another batch response', async () => {
      await Promise.all([places.getPlaceStatusByIds(['b', 'a']), places.getPlaceStatusByIds(['a', 'b'])])
      await places.getPlaceStatusByIds(['c'])
      expect(fetch.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('and Places is temporarily unavailable', () => {
    beforeEach(() => {
      fetch.fetch
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: [createMockedPlace({ positions: ['1,2'] })] })))
    })

    it('should propagate the failure and allow immediate recovery', async () => {
      await expect(places.getPlaceByParcel('1,2')).rejects.toThrow(ServiceUnavailableError)
      await expect(places.getPlaceByParcel('1,2')).resolves.toMatchObject({ positions: ['1,2'] })
      expect(fetch.fetch).toHaveBeenCalledTimes(2)
    })
  })
  describe('and a collaborator is revoked before the permission cache expires', () => {
    beforeEach(() => {
      fetch.fetch
        .mockResolvedValueOnce(new Response(JSON.stringify({ parcels: ['1,2'] })))
        .mockResolvedValueOnce(new Response('', { status: 404 }))
    })
    it('should observe the revocation immediately for a lasting-grant permission check', async () => {
      await expect(worlds.getWorldParcelPermissions('0xabc', 'name.eth', 'deployment')).resolves.toEqual(['1,2'])
      await expect(
        worlds.getWorldParcelPermissions('0xabc', 'name.eth', 'deployment', { skipCache: true })
      ).resolves.toBeUndefined()
      expect(fetch.fetch).toHaveBeenCalledTimes(2)
    })
  })
  describe('and ban-list permissions use a short cache', () => {
    describe('and the place is LAND', () => {
      beforeEach(() => {
        fetch.fetch.mockImplementation(async () => new Response(JSON.stringify({ owner: true })))
      })
      it('should refresh after ten seconds and bypass the cache for mutations', async () => {
        await lands.getLandPermissions('0xabc', ['1,2'], { shortCache: true })
        await lands.getLandPermissions('0xABC', ['1,2'], { shortCache: true })
        expect(fetch.fetch).toHaveBeenCalledTimes(1)
        await lands.getLandPermissions('0xabc', ['1,2'], { skipCache: true })
        expect(fetch.fetch).toHaveBeenCalledTimes(2)
        now += 10001
        jest.advanceTimersByTime(2)
        await lands.getLandPermissions('0xabc', ['1,2'], { shortCache: true })
        expect(fetch.fetch).toHaveBeenCalledTimes(3)
      })
      it('should report a permission provider outage as retryable', async () => {
        fetch.fetch.mockRejectedValueOnce(new Error('Lambdas offline'))
        await expect(lands.getLandPermissions('0xabc', ['1,2'], { shortCache: true })).rejects.toThrow(
          ServiceUnavailableError
        )
      })
    })
    describe('and the place is a world', () => {
      beforeEach(() => {
        fetch.fetch.mockImplementation(async () => new Response(JSON.stringify({ elements: [{ name: 'name' }] })))
      })
      it('should refresh name ownership after ten seconds and bypass it for mutations', async () => {
        await worlds.hasWorldOwnerPermission('0xabc', 'name.eth', { shortCache: true })
        await worlds.hasWorldOwnerPermission('0xABC', 'NAME.ETH', { shortCache: true })
        expect(fetch.fetch).toHaveBeenCalledTimes(1)
        await worlds.hasWorldOwnerPermission('0xabc', 'name.eth', { skipCache: true })
        expect(fetch.fetch).toHaveBeenCalledTimes(2)
        now += 10001
        jest.advanceTimersByTime(2)
        await worlds.hasWorldOwnerPermission('0xabc', 'name.eth', { shortCache: true })
        expect(fetch.fetch).toHaveBeenCalledTimes(3)
      })
      it('should report a name provider outage as retryable', async () => {
        fetch.fetch.mockResolvedValueOnce(new Response('', { status: 503 }))
        await expect(worlds.hasWorldOwnerPermission('0xabc', 'name.eth', { shortCache: true })).rejects.toThrow(
          ServiceUnavailableError
        )
      })
    })
  })
})
