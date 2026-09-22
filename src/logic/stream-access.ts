import { ILoggerComponent } from '@well-known-components/interfaces'
import { SceneStreamAccess } from '../types'
import { ILivekitComponent } from '../types/livekit.type'
import { getErrorMessage } from './errors'

/**
 * Deletes the LiveKit ingress of a stream access that was just replaced. The cleanup jobs only
 * see active rows, so otherwise its key keeps publishing into the old room indefinitely.
 * Best-effort: the replacement is already persisted, so a failure is logged, not thrown.
 *
 * @param livekit - LiveKit component used to delete the ingress.
 * @param logger - Logger for the failure case.
 * @param replaced - The access row that was just deactivated.
 * @param newIngressId - Ingress backing the replacement.
 */
export async function removeReplacedIngress(
  livekit: Pick<ILivekitComponent, 'removeIngress'>,
  logger: ILoggerComponent.ILogger,
  replaced: Pick<SceneStreamAccess, 'place_id' | 'ingress_id'>,
  newIngressId: string | undefined
): Promise<void> {
  // The same room hands back the same ingress; '' marks a Cast 2.0 row with none.
  if (!replaced.ingress_id || replaced.ingress_id === newIngressId) {
    return
  }

  try {
    await livekit.removeIngress(replaced.ingress_id)
  } catch (error) {
    logger.warn('Failed to remove the ingress of a replaced stream access', {
      placeId: replaced.place_id,
      ingressId: replaced.ingress_id,
      error: getErrorMessage(error)
    })
  }
}
