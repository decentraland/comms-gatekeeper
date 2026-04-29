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
  const nameByAddressCache = new LRUCache<string, string>({
    max: NAME_BY_ADDRESS_CACHE_MAX,
    ttl: NAME_BY_ADDRESS_CACHE_TTL
  })
  const inflightByAddress = new Map<string, ProfileBatch>()

  function formatProfileName(avatar: Profile['avatars'][number]): string {
    return avatar.hasClaimedName ? avatar.name : `${avatar.name}#${avatar.ethAddress.slice(-4)}`
  }

  async function fetchProfileBatch(lowerAddresses: string[]): Promise<Map<string, string>> {
    const profilesResponse = await fetch.fetch(`${lambdasBaseUrl}profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: lowerAddresses })
    })

    const profiles = (await profilesResponse.json()) as Profile[]
    const batchResult = new Map<string, string>()

    if (profiles && profiles.length > 0) {
      for (const profile of profiles) {
        const avatar = profile.avatars[0]
        if (!avatar) continue

        const name = formatProfileName(avatar)
        const lower = avatar.ethAddress.toLowerCase()
        nameByAddressCache.set(lower, name)
        batchResult.set(lower, name)
      }
    }

    return batchResult
  }

  async function getNamesFromAddresses(addresses: string[]): Promise<Record<string, string>> {
    if (addresses.length === 0) {
      return {}
    }

    const lowerToName = new Map<string, string>()
    const tagAlongs: Array<{ lower: string; batch: ProfileBatch }> = []
    const ownLowers: string[] = []
    const seen = new Set<string>()

    for (const address of addresses) {
      const lower = address.toLowerCase()
      if (seen.has(lower)) continue
      seen.add(lower)

      const cached = nameByAddressCache.get(lower)
      if (cached !== undefined) {
        lowerToName.set(lower, cached)
        continue
      }

      const inflight = inflightByAddress.get(lower)
      if (inflight) {
        tagAlongs.push({ lower, batch: inflight })
        continue
      }

      ownLowers.push(lower)
    }

    let ownTask: Promise<void> = Promise.resolve()

    if (ownLowers.length > 0) {
      const batchPromise: ProfileBatch = (async () => {
        try {
          return await fetchProfileBatch(ownLowers)
        } finally {
          for (const lower of ownLowers) {
            inflightByAddress.delete(lower)
          }
        }
      })()

      for (const lower of ownLowers) {
        inflightByAddress.set(lower, batchPromise)
      }

      ownTask = batchPromise.then((batchResult) => {
        for (const [lower, name] of batchResult) {
          lowerToName.set(lower, name)
        }
      })
    }

    const tagTasks: Promise<void>[] = tagAlongs.map(({ lower, batch }) =>
      batch.then(
        (batchResult) => {
          const name = batchResult.get(lower)
          if (name !== undefined) lowerToName.set(lower, name)
        },
        () => undefined
      )
    )

    await Promise.all([ownTask, ...tagTasks])

    const result: Record<string, string> = {}
    for (const address of addresses) {
      const name = lowerToName.get(address.toLowerCase())
      if (name !== undefined) {
        result[address] = name
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
