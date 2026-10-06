import { createContentClientComponent } from '../../src/adapters/content-client'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { PlaceNotFoundError, ServiceUnavailableError } from '../../src/types/errors'

describe('when looking up an entity across trusted content servers', () => {
  let component: Awaited<ReturnType<typeof createContentClientComponent>>
  let fetch: jest.Mock

  beforeEach(async () => {
    fetch = jest.fn()
    component = await createContentClientComponent({
      config: createConfigMockedComponent({
        requireString: jest.fn().mockResolvedValue('https://primary.example/content'),
        getString: jest.fn().mockResolvedValue('https://fallback.example/content')
      }),
      fetch: { fetch },
      logs: createLoggerMockedComponent()
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
})
