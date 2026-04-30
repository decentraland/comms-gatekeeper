import { Profile } from '@dcl/schemas'
import { createNamesComponent } from '../../src/adapters/names'
import { cachedFetchComponent } from '../../src/adapters/fetch'
import { ICachedFetchComponent } from '../../src/types/fetch.type'
import { INamesComponent } from '../../src/types/names.type'
import { NameOwnerNotFoundError } from '../../src/types/errors'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

function buildProfile(address: string, name: string, hasClaimedName = true): Profile {
  return {
    avatars: [
      {
        ethAddress: address,
        name,
        hasClaimedName
      } as Profile['avatars'][number]
    ]
  } as Profile
}

describe('names adapter', () => {
  const lambdasUrl = 'https://lambdas.example.com/'

  let namesComponent: INamesComponent
  let mockFetch: jest.Mock
  let cachedFetch: ICachedFetchComponent

  beforeEach(async () => {
    mockFetch = jest.fn()

    cachedFetch = await cachedFetchComponent({
      fetch: { fetch: mockFetch },
      logs: createLoggerMockedComponent()
    })

    namesComponent = await createNamesComponent({
      config: createConfigMockedComponent({
        requireString: jest.fn().mockResolvedValue(lambdasUrl)
      }),
      fetch: { fetch: mockFetch },
      cachedFetch,
      logs: createLoggerMockedComponent()
    })
  })

  describe('when getting the owner of a name', () => {
    const name = 'foo.eth'

    describe('and the name has an owner', () => {
      let result: string | null

      beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ owner: '0xOwnerAddress' })
        })
        result = await namesComponent.getNameOwner(name)
      })

      it('should call the lambdas owner endpoint with the name in the URL', () => {
        expect(mockFetch).toHaveBeenCalledWith(`${lambdasUrl}names/${name}/owner`)
      })

      it('should return the owner address as-returned by the upstream', () => {
        expect(result).toBe('0xOwnerAddress')
      })
    })

    describe('and the same name is requested twice', () => {
      beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ owner: '0xOwnerAddress' })
        })
        await namesComponent.getNameOwner(name)
        await namesComponent.getNameOwner(name)
      })

      it('should call the upstream only once', () => {
        expect(mockFetch).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the name contains URL-control characters', () => {
      const sneakyName = 'evil/../something'

      beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ owner: '0xOwnerAddress' })
        })
        await namesComponent.getNameOwner(sneakyName)
      })

      it('should percent-encode the name in the URL path', () => {
        expect(mockFetch).toHaveBeenCalledWith(`${lambdasUrl}names/${encodeURIComponent(sneakyName)}/owner`)
      })
    })

    describe('and the upstream returns 404', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404
        })
      })

      it('should throw a NameOwnerNotFoundError', async () => {
        await expect(namesComponent.getNameOwner(name)).rejects.toBeInstanceOf(NameOwnerNotFoundError)
      })
    })

    describe('and the upstream rejects', () => {
      beforeEach(() => {
        mockFetch.mockRejectedValueOnce(new Error('boom'))
      })

      it('should throw a NameOwnerNotFoundError', async () => {
        await expect(namesComponent.getNameOwner(name)).rejects.toBeInstanceOf(NameOwnerNotFoundError)
      })
    })

    describe('and the upstream returns 404 then succeeds on retry', () => {
      let firstResult: Error | null
      let secondResult: string | null

      beforeEach(async () => {
        firstResult = null
        mockFetch.mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ owner: '0xOwnerAddress' })
        })

        try {
          await namesComponent.getNameOwner(name)
        } catch (err) {
          firstResult = err as Error
        }
        secondResult = await namesComponent.getNameOwner(name)
      })

      it('should not cache the failed lookup', () => {
        expect(firstResult).toBeInstanceOf(NameOwnerNotFoundError)
        expect(secondResult).toBe('0xOwnerAddress')
        expect(mockFetch).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('when resolving names from addresses', () => {
    describe('and the input is empty', () => {
      let result: Record<string, string>

      beforeEach(async () => {
        result = await namesComponent.getNamesFromAddresses([])
      })

      it('should return an empty map without calling the upstream', () => {
        expect(result).toEqual({})
        expect(mockFetch).not.toHaveBeenCalled()
      })
    })

    describe('and all addresses miss the cache', () => {
      let result: Record<string, string>

      beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue([
              buildProfile('0xaaaa', 'alice', true),
              buildProfile('0xbbbb', 'bob', false)
            ] as Profile[])
        })
        result = await namesComponent.getNamesFromAddresses(['0xaaaa', '0xbbbb'])
      })

      it('should POST the requested addresses to /profiles with a JSON body', () => {
        expect(mockFetch).toHaveBeenCalledWith(`${lambdasUrl}profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ['0xaaaa', '0xbbbb'] })
        })
      })

      it('should return resolved names keyed by the input addresses', () => {
        expect(result).toEqual({
          '0xaaaa': 'alice',
          '0xbbbb': 'bob#bbbb'
        })
      })
    })

    describe('and the same addresses are requested twice', () => {
      let firstResult: Record<string, string>
      let secondResult: Record<string, string>

      beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([buildProfile('0xaaaa', 'alice')])
        })
        firstResult = await namesComponent.getNamesFromAddresses(['0xaaaa'])
        secondResult = await namesComponent.getNamesFromAddresses(['0xaaaa'])
      })

      it('should hit the upstream only once', () => {
        expect(mockFetch).toHaveBeenCalledTimes(1)
      })

      it('should return the cached name on the second call', () => {
        expect(firstResult).toEqual({ '0xaaaa': 'alice' })
        expect(secondResult).toEqual({ '0xaaaa': 'alice' })
      })
    })

    describe('and the input mixes cached and uncached addresses', () => {
      let result: Record<string, string>

      beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([buildProfile('0xaaaa', 'alice')])
        })
        await namesComponent.getNamesFromAddresses(['0xaaaa'])

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([buildProfile('0xbbbb', 'bob')])
        })
        result = await namesComponent.getNamesFromAddresses(['0xaaaa', '0xbbbb'])
      })

      it('should only fetch the uncached address', () => {
        expect(mockFetch).toHaveBeenCalledTimes(2)
        expect(mockFetch).toHaveBeenLastCalledWith(`${lambdasUrl}profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ['0xbbbb'] })
        })
      })

      it('should merge cached and freshly-fetched names into the result', () => {
        expect(result).toEqual({ '0xaaaa': 'alice', '0xbbbb': 'bob' })
      })
    })

    describe('and the same address is provided twice with different casing', () => {
      let result: Record<string, string>

      beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([buildProfile('0xaaaa', 'alice')])
        })
        result = await namesComponent.getNamesFromAddresses(['0xAAAA', '0xaaaa'])
      })

      it('should send only the lowercased address to the upstream', () => {
        expect(mockFetch).toHaveBeenCalledWith(`${lambdasUrl}profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ['0xaaaa'] })
        })
      })

      it('should return the resolved name under both input casings', () => {
        expect(result).toEqual({ '0xAAAA': 'alice', '0xaaaa': 'alice' })
      })
    })

    describe('and the upstream returns no profiles for any address', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([])
        })
      })

      it('should resolve to an empty record', async () => {
        await expect(namesComponent.getNamesFromAddresses(['0xaaaa'])).resolves.toEqual({})
      })
    })

    describe('and a partial match is returned alongside cached entries', () => {
      let result: Record<string, string>

      beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([buildProfile('0xaaaa', 'alice')])
        })
        await namesComponent.getNamesFromAddresses(['0xaaaa'])

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([])
        })
        result = await namesComponent.getNamesFromAddresses(['0xaaaa', '0xbbbb'])
      })

      it('should still return the cache hit and skip the missing address', () => {
        expect(result).toEqual({ '0xaaaa': 'alice' })
      })
    })

    describe('and an address has no profile upstream', () => {
      let firstResult: Record<string, string>
      let secondResult: Record<string, string>

      beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue([buildProfile('0xaaaa', 'alice')])
        })
        firstResult = await namesComponent.getNamesFromAddresses(['0xaaaa', '0xbbbb'])
        secondResult = await namesComponent.getNamesFromAddresses(['0xbbbb'])
      })

      it('should resolve the address that was returned and skip the missing one', () => {
        expect(firstResult).toEqual({ '0xaaaa': 'alice' })
      })

      it('should not re-fetch the missing address on a subsequent call', () => {
        expect(mockFetch).toHaveBeenCalledTimes(1)
      })

      it('should resolve to an empty record when the only address requested is negatively cached', () => {
        expect(secondResult).toEqual({})
      })
    })

    describe('and two concurrent callers request overlapping addresses', () => {
      let resultA: Record<string, string>
      let resultB: Record<string, string>

      beforeEach(async () => {
        mockFetch.mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    ok: true,
                    json: jest.fn().mockResolvedValue([buildProfile('0xaaaa', 'alice'), buildProfile('0xbbbb', 'bob')])
                  }),
                0
              )
            )
        )

        const callA = namesComponent.getNamesFromAddresses(['0xaaaa', '0xbbbb'])
        const callB = namesComponent.getNamesFromAddresses(['0xbbbb'])
        ;[resultA, resultB] = await Promise.all([callA, callB])
      })

      it('should issue a single batched POST', () => {
        expect(mockFetch).toHaveBeenCalledTimes(1)
      })

      it('should resolve both callers from the shared batch', () => {
        expect(resultA).toEqual({ '0xaaaa': 'alice', '0xbbbb': 'bob' })
        expect(resultB).toEqual({ '0xbbbb': 'bob' })
      })
    })
  })
})
