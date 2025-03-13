import { isErrorWithMessage } from '../logic/errors'
import { AppComponents } from '../types'

export type IBlockListComponent = {
  isBlacklisted: (identity: string) => Promise<boolean>
}

export async function createBlockListComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'logs'>
): Promise<IBlockListComponent> {
  const { config, fetch, logs } = components

  const logger = logs.getLogger('blocklist')
  const blacklistUrl = await config.requireString('BLACKLIST_JSON_URL')

  async function fetchBlacklistedWallets(): Promise<Set<string>> {
    const response = await fetch.fetch(blacklistUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch deny list, status: ${response.status}`)
    }
    const data = await response.json()
    if (data.users && Array.isArray(data.users)) {
      return new Set(data.users.map((user: { wallet: string }) => user.wallet.toLowerCase()))
    }
    return new Set()
  }

  async function isBlacklisted(identity: string): Promise<boolean> {
    try {
      const denyList = await fetchBlacklistedWallets()
      return denyList.has(identity.toLowerCase())
    } catch (error) {
      logger.warn(`Error fetching deny list ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`)
      return false
    }
  }

  return {
    isBlacklisted
  }
}
