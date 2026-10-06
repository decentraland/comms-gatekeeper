import { AppComponents } from '../types'
import { InvalidRequestError } from '../types/errors'

/**
 * Resolves legacy world-name scene IDs and canonicalizes world content IDs before authorization.
 * @param worlds - World scene lookup component.
 * @param worldName - World whose scene is requested.
 * @param sceneId - Content ID or legacy world name.
 * @returns The lowercase content ID used by both authorization and LiveKit.
 * @throws InvalidRequestError when the legacy world scene cannot be resolved.
 */
export async function resolveWorldSceneId(
  worlds: Pick<AppComponents['worlds'], 'fetchWorldSceneId'>,
  worldName: string,
  sceneId: string
): Promise<string> {
  if (!sceneId.toLowerCase().endsWith('.eth')) {
    return sceneId.toLowerCase()
  }
  try {
    return (await worlds.fetchWorldSceneId(worldName)).toLowerCase()
  } catch {
    throw new InvalidRequestError(`Failed to resolve scene ID for world ${worldName}`)
  }
}
