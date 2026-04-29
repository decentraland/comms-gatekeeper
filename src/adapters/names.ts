import { LRUCache } from 'lru-cache'
import { EthAddress, Profile } from '@dcl/schemas'
import { ensureSlashAtTheEnd } from '../logic/utils'
import { AppComponents } from '../types'
import { INamesComponent } from '../types/names.type'
import { NameOwnerNotFoundError, ProfilesNotFoundError } from '../types/errors'
import { isErrorWithMessage } from '../logic/errors'

const NAME_BY_ADDRESS_CACHE_MAX = 10000
const NAME_BY_ADDRESS_CACHE_TTL = 1000 * 60 * 5

type ProfileBatch = Promise<Map<string, string>>

export async function createNamesComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'cachedFetch' | 'logs'>
): Promise<INamesComponent> {
  const { config, fetch, cachedFetch, logs } = components
  const logger = logs.getLogger('names-component')

  const lambdasUrl = await config.requireString('LAMBDAS_URL')

  const lambdasBaseUrl = ensureSlashAtTheEnd(lambdasUrl)
  if (!lambdasBaseUrl) {
    logger.error('Lambdas URL is not set')
    throw new Error('Lambdas URL is not set')
  }

  const nameOwnerCache = cachedFetch.cache<{ owner: string }>()
  // Caches a display name for each lowercased address. A `null` entry is a negative
  // cache marker meaning the upstream confirmed no profile exists for that address.
  const nameByAddressCache = new LRUCache<string, string | null>({
    max: NAME_BY_ADDRESS_CACHE_MAX,
    ttl: NAME_BY_ADDRESS_CACHE_TTL
  })
  const inflightByAddress = new Map<string, ProfileBatch>()

  function formatProfileName(avatar: Profile['avatars'][number]): string {
    return avatar.hasClaimedName ? avatar.name : `${avatar.name}#${avatar.ethAddress.slice(-4)}`
  }

  /**
   * Sends a batched POST to the lambdas /profiles endpoint and parses the response
   * into a map of resolved display names. Only addresses for which the upstream
   * returned a profile appear in the result; missing addresses are absent from the
   * map. The cache is not touched here — `getNamesFromAddresses` is the sole owner
   * of the cache and persists both positive and negative results.
   *
   * @param addresses - Lowercased ETH addresses to look up.
   * @returns Map keyed by lowercased address to formatted display name.
   */
  async function fetchProfileBatch(addresses: string[]): Promise<Map<string, string>> {
    const profilesResponse = await fetch.fetch(`${lambdasBaseUrl}profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: addresses })
    })

    const profiles = (await profilesResponse.json()) as Profile[]
    const batchResult = new Map<string, string>()

    if (profiles && profiles.length > 0) {
      for (const profile of profiles) {
        const avatar = profile.avatars[0]
        if (!avatar) continue

        const name = formatProfileName(avatar)
        const address = avatar.ethAddress.toLowerCase()
        batchResult.set(address, name)
      }
    }

    return batchResult
  }

  /**
   * Resolves a list of ETH addresses into their display names via the lambdas
   * /profiles endpoint, deduplicating work at three levels:
   *
   * 1. **Per-address LRU cache** (positive and negative entries) so repeated lookups
   *    skip the upstream entirely. Cache keys are lowercased addresses; a cached
   *    `null` means the upstream previously confirmed no profile exists.
   * 2. **In-flight registry** so concurrent callers asking for the same address
   *    share one pending batch instead of issuing parallel POSTs.
   * 3. **Mixed-case input dedup** so `[0xABC, 0xabc]` only sends one address upstream
   *    and still returns both casings as keys in the response.
   *
   * The returned record preserves the original casing of each input address.
   *
   * @param addresses - ETH addresses (any casing) to resolve.
   * @returns Object keyed by the input address (original casing preserved) to the
   *   resolved display name. Addresses without a profile are absent from the map.
   * @throws ProfilesNotFoundError if no addresses can be resolved (neither from cache
   *   nor from the upstream response).
   */
  async function getNamesFromAddresses(addresses: string[]): Promise<Record<string, string>> {
    if (addresses.length === 0) {
      return {}
    }

    // Intermediate maps and the in-flight registry are keyed by lowercased addresses.
    // The result map is keyed by the original input casing, populated below.
    const nameByAddress = new Map<string, string>()
    const tagAlongs: Array<{ address: string; batch: ProfileBatch }> = []
    const ownAddresses: string[] = []
    const seen = new Set<string>()

    for (const inputAddress of addresses) {
      const address = inputAddress.toLowerCase()
      if (seen.has(address)) continue
      seen.add(address)

      const cached = nameByAddressCache.get(address)
      if (cached !== undefined) {
        // null indicates a negative cache entry; skip without re-fetching.
        if (cached !== null) {
          nameByAddress.set(address, cached)
        }
        continue
      }

      const inflight = inflightByAddress.get(address)
      if (inflight) {
        tagAlongs.push({ address, batch: inflight })
        continue
      }

      ownAddresses.push(address)
    }

    let ownTask: Promise<void> = Promise.resolve()

    if (ownAddresses.length > 0) {
      const batchPromise: ProfileBatch = (async () => {
        try {
          return await fetchProfileBatch(ownAddresses)
        } finally {
          for (const address of ownAddresses) {
            inflightByAddress.delete(address)
          }
        }
      })()

      for (const address of ownAddresses) {
        inflightByAddress.set(address, batchPromise)
      }

      ownTask = batchPromise.then((batchResult) => {
        // The owner is responsible for persisting both positive and negative results
        // for every address it owned. Addresses absent from `batchResult` are recorded
        // as null so subsequent callers don't re-issue the same upstream lookup.
        for (const address of ownAddresses) {
          const name = batchResult.get(address)
          nameByAddressCache.set(address, name ?? null)
          if (name !== undefined) {
            nameByAddress.set(address, name)
          }
        }
      })
    }

    const tagTasks: Promise<void>[] = tagAlongs.map(({ address, batch }) =>
      batch.then(
        (batchResult) => {
          const name = batchResult.get(address)
          if (name !== undefined) nameByAddress.set(address, name)
        },
        () => undefined
      )
    )

    await Promise.all([ownTask, ...tagTasks])

    const result: Record<string, string> = {}
    for (const inputAddress of addresses) {
      const name = nameByAddress.get(inputAddress.toLowerCase())
      if (name !== undefined) {
        result[inputAddress] = name
      }
    }

    if (Object.keys(result).length === 0) {
      logger.info(`Profiles not found for ${addresses}`)
      throw new ProfilesNotFoundError(`Profiles not found for ${addresses}`)
    }

    return result
  }

  async function getNameOwner(name: string): Promise<EthAddress | null> {
    try {
      const nameOwner = await nameOwnerCache.fetch(`${lambdasBaseUrl}names/${encodeURIComponent(name)}/owner`)
      return nameOwner?.owner ?? null
    } catch (error) {
      logger.error(
        `Failed to fetch name owner for ${name}: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
      )
      throw new NameOwnerNotFoundError(`Name owner not found for ${name}`)
    }
  }

  return {
    getNamesFromAddresses,
    getNameOwner
  }
}
