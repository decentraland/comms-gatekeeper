import { AppComponents } from '../types'

export type IBlockListComponent = {
  isBlacklisted: (identity: string) => Promise<boolean>
}

export async function createBlockListComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs'>
): Promise<IBlockListComponent> {
  const { config, cachedFetch, logs } = components
  const logger = logs.getLogger('blocklist-component')

  const blocklistCache = cachedFetch.cache<{ users: { wallet: string }[] }>()
  const blacklistUrl = await config.requireString('BLACKLIST_JSON_URL')

  async function fetchBlacklistedWallets(): Promise<Set<string>> {
    const cachedBlacklist = await blocklistCache.fetch(blacklistUrl)

    if (cachedBlacklist?.users && Array.isArray(cachedBlacklist?.users)) {
      return new Set(cachedBlacklist.users.map((user: { wallet: string }) => user.wallet.toLowerCase()))
    }

    logger.warn(`Failed get the deny list, did not get an array of users`)
    return new Set()
  }

  async function isBlacklisted(identity: string): Promise<boolean> {
    const denyList = await fetchBlacklistedWallets()
    return denyList.has(identity.toLowerCase())
  }

  return {
    isBlacklisted
  }
}
