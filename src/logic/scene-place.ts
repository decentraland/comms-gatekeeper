import { AppComponents } from '../types'
import { PlaceAttributes } from '../types/places.type'
import { PlaceNotFoundError } from '../types/errors'

/**
 * Resolves the Place that owns the scene identified by `sceneId` — the security-critical
 * counterpart to LiveKit room naming. Room names are derived from `sceneId`, so admin/ban
 * decisions MUST resolve the place from the same `sceneId` (never from a separately-supplied
 * parcel, which a caller could mismatch to prove rights over a different scene).
 *
 * For worlds, the world content server maps the entity id to its place. For Genesis City, the
 * scene entity's base parcel is looked up first, then the Places API resolves the place there.
 *
 * @param components - contentClient (scene entities) and places (Places API).
 * @param params - `sceneId` (authoritative) and, for worlds, the `worldName`.
 * @returns The place that owns the scene.
 * @throws {PlaceNotFoundError} If the scene entity or its base parcel cannot be resolved.
 */
export async function resolvePlaceBySceneId(
  components: Pick<AppComponents, 'contentClient' | 'places'>,
  params: { sceneId: string; worldName?: string }
): Promise<PlaceAttributes> {
  const { contentClient, places } = components
  const { sceneId, worldName } = params

  if (worldName) {
    return places.getWorldScenePlaceByEntityId(worldName, sceneId)
  }

  const entity = await contentClient.fetchEntityById(sceneId)
  const base = entity?.metadata?.scene?.base
  if (!base) {
    throw new PlaceNotFoundError(`No scene entity found for scene ID ${sceneId}`)
  }
  return places.getPlaceByParcel(base)
}
