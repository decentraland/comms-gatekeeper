import { IHttpServerComponent } from '@dcl/core-commons'
import { HandlerContextWithPath } from '../../types'
import { presenceWarmingResponse } from '../../logic/presence-map/warming'

/**
 * `GET /hot-scenes` — the busiest Genesis City scenes, ranked by how many players stand on them.
 *
 * Ported from archipelago-stats, which read peer positions from the retired stats service; the
 * source is now Pulse's presence map. The response shape is unchanged (contract C3): a bare array
 * of `HotSceneInfo`, top 100 by `usersTotalCount` descending, main realm only.
 *
 * The ranking is precomputed on a timer by the hot-scenes component, because the join needs
 * catalyst metadata for every occupied tile and the answer is identical for every caller.
 *
 * Answers `503 {"ok":false,"error":"warming"}` until the presence map has been primed. A stale
 * ranking would be a fine answer, but an empty one is not: "no scene is busy" and "we do not know
 * yet" are different facts, and every caller downstream would read the first as the city being
 * deserted.
 */
export async function getHotScenesHandler(
  context: Pick<HandlerContextWithPath<'presenceMap' | 'hotScenes', '/hot-scenes'>, 'components'>
): Promise<IHttpServerComponent.IResponse> {
  const { presenceMap, hotScenes } = context.components

  if (!presenceMap.isReady()) {
    return presenceWarmingResponse()
  }

  return {
    status: 200,
    body: hotScenes.getHotScenes()
  }
}
