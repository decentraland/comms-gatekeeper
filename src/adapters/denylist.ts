import { AppComponents } from '../types'

export type IDenyListComponent = {
  isDenylisted: (identity: string) => Promise<boolean>
}

export async function createDenyListComponent(
  components: Pick<AppComponents, 'config' | 'cachedFetch' | 'logs'>
): Promise<IDenyListComponent> {
  const { config, cachedFetch, logs } = components
  const logger = logs.getLogger('DenyList-component')

  const DenyListCache = cachedFetch.cache<{ users: { wallet: string }[] }>()
  const denylistUrl = await config.requireString('DENYLIST_JSON_URL')

  async function fetchDenylistedWallets(): Promise<Set<string>> {
    const cachedDenylist = await DenyListCache.fetch(denylistUrl)

    if (cachedDenylist?.users && Array.isArray(cachedDenylist?.users)) {
      return new Set(cachedDenylist.users.map((user: { wallet: string }) => user.wallet.toLowerCase()))
    }

    logger.warn(`Failed get the deny list, did not get an array of users`)
    return new Set()
  }

  async function isDenylisted(identity: string): Promise<boolean> {
    const denyList = await fetchDenylistedWallets()
    return denyList.has(identity.toLowerCase())
  }

  return {
    isDenylisted
  }
}
