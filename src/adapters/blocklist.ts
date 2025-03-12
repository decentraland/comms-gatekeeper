import { AppComponents } from '../types'

export type IBlockListComponent = {
  isBlacklisted: (identity: string) => Promise<boolean>
}

export async function createBlockListComponent(
  components: Pick<AppComponents, 'config' | 'fetch'>
): Promise<IBlockListComponent> {
  const { config, fetch } = components

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
    const denyList = await fetchBlacklistedWallets()
    return denyList.has(identity.toLowerCase())
  }

  return {
    isBlacklisted
  }
}
