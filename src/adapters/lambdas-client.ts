import { LRUCache } from 'lru-cache'
import { LambdasClient, createLambdasClient } from 'dcl-catalyst-client'
import { AppComponents } from '../types'
import { ILambdasClientComponent } from '../types/lambdas-client.type'
import { EthAddress } from '@dcl/schemas'

export async function createLambdasClientComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'logs'>
): Promise<ILambdasClientComponent> {
  const { config, fetch, logs } = components
  const max = (await config.getNumber('LAMBDAS_CLIENT_CACHE_MAX')) ?? 1000
  const ttl = (await config.getNumber('LAMBDAS_CLIENT_CACHE_TTL')) ?? 1000 * 60 * 5 // 5 minutes default

  const logger = logs.getLogger('cached-lambdas-client-component')

  const lambdasUrl = await config.requireString('LAMBDAS_URL')
  const client: LambdasClient = createLambdasClient({ url: lambdasUrl, fetcher: fetch })

  const entityCache = new LRUCache<EthAddress, any>({
    max,
    ttl,
    fetchMethod: async function (userAddress: EthAddress): Promise<any> {
      try {
        logger.debug(`Fetching entity for userId: ${userAddress}`)
        const entity = await client.getAvatarDetails(userAddress)
        logger.debug(`Successfully fetched entity for userId: ${userAddress}`)
        return entity
      } catch (err: any) {
        logger.warn(`Error fetching entity for userId ${userAddress}:`, err)
        throw err
      }
    }
  })

  return {
    getAvatarDetails: async (userAddress: EthAddress) => {
      return entityCache.fetch(userAddress)
    }
  }
}
