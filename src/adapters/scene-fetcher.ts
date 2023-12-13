import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents, Permissions } from '../types'
import { LRUCache } from 'lru-cache'

export type ISceneFetcherComponent = IBaseComponent & {
  fetchWorldPermissions(worldName: string): Promise<Permissions | undefined>
  fetchScenePermissions: (sceneId: string) => Promise<Permissions | undefined>
}

export async function createSceneFetcherComponent(
  components: Pick<AppComponents, 'config' | 'fetch' | 'logs'>
): Promise<ISceneFetcherComponent> {
  const { config, fetch, logs } = components

  const logger = logs.getLogger('scene-fetcher')

  const [worldContentUrl, catalystContentUrl] = await Promise.all([
    config.requireString('WORLD_CONTENT_URL'),
    config.requireString('CATALYST_CONTENT_URL')
  ])

  const sceneByWold = new LRUCache<string, string>({
    max: 1000,
    ttl: 1000 * 60 * 5, // 5 min
    fetchMethod: async function (worldName: string, _staleValue: string | void): Promise<string> {
      try {
        const response = await fetch.fetch(`${worldContentUrl}/world/${worldName}/about`)
        const about = await response.json()

        const sceneUrn = about.configurations.scenesUrn[0]
        const fragments = sceneUrn.split('?')
        const urn = fragments[0]
        const urnFragments = urn.split(':')
        const sceneId = urnFragments[urnFragments.length - 1]

        return sceneId
      } catch (err: any) {
        logger.warn(err)
        return ''
      }
    }
  })

  const permissionsCache = new LRUCache<string, Permissions>({
    max: 1000,
    ttl: 1000 * 60 * 5, // 5 min
    fetchMethod: async function (url: string, _staleValue: Permissions | void): Promise<Permissions> {
      try {
        const response = await fetch.fetch(url)
        const scene = await response.json()
        logger.log(scene)

        // TODO
        return {
          cast: [],
          mute: []
        }
      } catch (err: any) {
        logger.warn(err)
        return {
          cast: [],
          mute: []
        }
      }
    }
  })

  async function fetchWorldPermissions(worldName: string): Promise<Permissions | undefined> {
    const sceneId = await sceneByWold.fetch(worldName)
    if (!sceneId) {
      return undefined
    }

    return permissionsCache.fetch(`${worldContentUrl}/contents/${sceneId}`)
  }

  async function fetchScenePermissions(sceneId: string): Promise<Permissions | undefined> {
    return permissionsCache.fetch(`${catalystContentUrl}/contents/${sceneId}`)
  }

  return {
    fetchWorldPermissions,
    fetchScenePermissions
  }
}
