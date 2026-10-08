import { createContentClientComponent } from '../../src/adapters/content-client'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { PlaceNotFoundError, ServiceUnavailableError } from '../../src/types/errors'

describe('when looking up an entity across trusted content servers', () => {
  let component: Awaited<ReturnType<typeof createContentClientComponent>>
  let fetch: jest.Mock
  let warn: jest.Mock

  beforeEach(async () => {
    fetch = jest.fn()
    warn = jest.fn()
    component = await createContentClientComponent({
      config: createConfigMockedComponent({
        requireString: jest.fn().mockResolvedValue('https://primary.example/content'),
        getString: jest.fn().mockResolvedValue('https://fallback.example/content')
      }),
      fetch: { fetch },
      logs: createLoggerMockedComponent({ warn })
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.resetAllMocks()
  })

  describe('and an entity is missing from every server', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['performance'] })
      fetch.mockImplementation(async () => new Response('[]'))
    })

    it('should reuse a confirmed miss without more outbound calls', async () => {
      await expect(component.fetchEntityById('missing')).rejects.toThrow(PlaceNotFoundError)
      await expect(component.fetchEntityById('missing')).rejects.toThrow(PlaceNotFoundError)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('should discover an entity after the short negative cache expires', async () => {
      await expect(component.fetchEntityById('missing')).rejects.toThrow(PlaceNotFoundError)
      // LRU TTLs use performance.now; advancing wall time alone would not expire them.
      jest.spyOn(performance, 'now').mockReturnValue(performance.now() + 6000)
      fetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'missing' }])))
      await expect(component.fetchEntityById('missing')).resolves.toEqual({ id: 'missing' })
      jest.restoreAllMocks()
    })
  })

  describe('and a server is temporarily unavailable', () => {
    beforeEach(() => {
      fetch.mockRejectedValue(new Error('network unavailable'))
    })

    it('should retry immediately instead of caching a transient failure', async () => {
      await expect(component.fetchEntityById('scene')).rejects.toThrow(ServiceUnavailableError)
      fetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'scene' }])))
      await expect(component.fetchEntityById('scene')).resolves.toEqual({ id: 'scene' })
    })
  })

  describe('and only the fallback has synced the requested scene', () => {
    beforeEach(() => {
      fetch
        .mockResolvedValueOnce(new Response('[]'))
        .mockResolvedValueOnce(
          new Response(JSON.stringify([{ id: 'scene-b', metadata: { scene: { base: '10,20', parcels: ['10,20'] } } }]))
        )
    })

    it('should return the exact entity from the fallback', async () => {
      expect(await component.fetchEntityById('scene-b')).toEqual(expect.objectContaining({ id: 'scene-b' }))
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        'https://primary.example/content/entities/active',
        'https://fallback.example/content/entities/active'
      ])
    })
  })

  describe('and the servers return only an unrelated entity', () => {
    beforeEach(() => {
      fetch.mockImplementation(async () => new Response(JSON.stringify([{ id: 'scene-a' }])))
    })

    it('should reject instead of authorizing an unrelated scene', async () => {
      await expect(component.fetchEntityById('scene-b')).rejects.toThrow(PlaceNotFoundError)
    })
  })
  describe('and an active deployment check follows a cached pointer lookup', () => {
    beforeEach(() => {
      fetch
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'old-deployment' }])))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'new-deployment' }])))
    })

    it('should bypass the pointer cache for mutation authorization', async () => {
      await expect(component.fetchEntitiesByPointers(['1,2'])).resolves.toEqual([{ id: 'old-deployment' }])
      await expect(component.fetchEntitiesByPointers(['1,2'], { skipCache: true })).resolves.toEqual([
        { id: 'new-deployment' }
      ])
    })
  })
  describe('and only a trusted fallback has the active deployment', () => {
    beforeEach(() => {
      fetch
        .mockResolvedValueOnce(new Response('[]'))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'new-deployment' }])))
    })

    it('should retain trusted fallback support during active deployment checks', async () => {
      await expect(
        component.fetchEntitiesByPointers(['1,2'], { skipCache: true, expectedEntityId: 'new-deployment' })
      ).resolves.toEqual([{ id: 'new-deployment' }])
      expect(fetch).toHaveBeenCalledTimes(2)
    })
  })
  describe('and a pointer lookup has a failed server and a confirmed miss', () => {
    beforeEach(() => {
      fetch.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(new Response('[]'))
    })
    it('should log the failed trusted source with scene and pointer context', async () => {
      await expect(
        component.fetchEntitiesByPointers(['1,2'], { skipCache: true, expectedEntityId: 'old' })
      ).rejects.toThrow(ServiceUnavailableError)
      expect(warn).toHaveBeenCalledWith('Trusted active scene lookup failed', {
        server: 'https://primary.example/content',
        pointers: '1,2',
        sceneId: 'old',
        error: expect.any(String)
      })
    })
    it('should report an inconclusive lookup as retryable', async () => {
      await expect(
        component.fetchEntitiesByPointers(['1,2'], { skipCache: true, expectedEntityId: 'old' })
      ).rejects.toThrow(ServiceUnavailableError)
    })
  })
  describe('and trusted pointer lookups overlap', () => {
    let release: () => void
    beforeEach(() => {
      fetch
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              release = () => resolve(new Response('[]'))
            })
        )
        .mockImplementationOnce(async () => {
          release()
          return new Response(JSON.stringify([{ id: 'current' }]))
        })
    })
    it('should start the fallback before the primary finishes', async () => {
      await expect(
        component.fetchEntitiesByPointers(['1,2'], { skipCache: true, expectedEntityId: 'current' })
      ).resolves.toEqual([{ id: 'current' }])
    })
  })
  describe('and a matching Catalyst responds before another server', () => {
    let release: () => void
    beforeEach(() => {
      fetch
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              release = () => resolve(new Response('[]'))
            })
        )
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'current' }])))
    })
    afterEach(() => {
      release()
    })
    it('should return the matching deployment without waiting for the slow server', async () => {
      await expect(
        component.fetchEntitiesByPointers(['1,2'], { skipCache: true, expectedEntityId: 'current' })
      ).resolves.toEqual([{ id: 'current' }])
    })
  })
  describe('and all Catalysts confirm the deployment is absent', () => {
    beforeEach(() => {
      fetch.mockImplementation(async () => new Response('[]'))
    })
    it('should return a confirmed miss', async () => {
      await expect(
        component.fetchEntitiesByPointers(['1,2'], { skipCache: true, expectedEntityId: 'missing' })
      ).resolves.toEqual([])
    })
  })
})
