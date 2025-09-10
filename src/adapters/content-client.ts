import { ContentClient, createContentClient } from 'dcl-catalyst-client'
import { AppComponents } from '../types'
import { IContentClientComponent } from '../types/content-client.type'

export async function createContentClientComponent(
  components: Pick<AppComponents, 'config' | 'fetch'>
): Promise<IContentClientComponent> {
  const { config, fetch } = components

  const catalystContentUrl = await config.requireString('CATALYST_CONTENT_URL')
  const catalyst: ContentClient = createContentClient({ url: catalystContentUrl, fetcher: fetch })

  return {
    fetchEntityById: catalyst.fetchEntityById
  }
}
