import { getErrorMessage } from '../logic/errors'
import { AppComponents } from '../types'
import { IStreamingChecker } from '../types/checker.type'
import { CronJob } from 'cron'
import { NotificationStreamingType } from '../types/notification.type'

export async function createStreamingTTLChecker(
  components: Pick<AppComponents, 'logs' | 'sceneStreamAccessManager' | 'livekit' | 'notifications' | 'places'>
): Promise<IStreamingChecker> {
  const { logs, sceneStreamAccessManager, livekit, notifications, places } = components
  const logger = logs.getLogger(`streaming-ttl-checker`)
  let job: CronJob
  let isProcessing = false

  async function reconcileStreamingState(): Promise<void> {
    try {
      const snapshots = await sceneStreamAccessManager.getStreamingAccessesToReconcile()
      // Five concurrent, individually time-bounded reads keep outages from delaying the TTL pass
      // by up to 100 sequential network timeouts.
      for (let i = 0; i < snapshots.length; i += 5) {
        await Promise.all(
          snapshots.slice(i, i + 5).map(async (snapshot) => {
            try {
              if ((await livekit.isIngressStreaming(snapshot.ingress_id)) === false) {
                if (await sceneStreamAccessManager.clearStaleStreamingState(snapshot)) {
                  logger.info('Recovered a stale streaming flag', {
                    ingressId: snapshot.ingress_id,
                    accessId: snapshot.id
                  })
                }
              }
            } catch (error) {
              logger.error('Could not reconcile streaming state', {
                ingressId: snapshot.ingress_id,
                error: getErrorMessage(error)
              })
            }
          })
        )
      }
    } catch (error) {
      // Reconciliation failure must not prevent the existing four-hour streaming limit.
      logger.error('Could not select streaming states to reconcile', { error: getErrorMessage(error) })
    }
  }

  async function start(): Promise<void> {
    job = new CronJob(
      '* * * * *',
      async function () {
        if (isProcessing) {
          logger.info('Previous job still running, skipping this execution')
          return
        }

        isProcessing = true
        try {
          logger.info(`Looking into active streamings.`)

          await reconcileStreamingState()

          const expiredStreamings = await sceneStreamAccessManager.getExpiredStreamAccesses()
          logger.info(`Found ${expiredStreamings.length} active streamings to verify.`)

          if (expiredStreamings.length === 0) {
            return
          }

          logger.info(`Found ${expiredStreamings.length} streamings that exceed the maximum allowed time.`)

          const placesIdsWithExpiredStreamings = expiredStreamings.map((streaming) => streaming.place_id)

          const BATCH_SIZE = 100
          let placesWithExpiredStreamings: Awaited<ReturnType<typeof places.getPlaceStatusByIds>> = []

          for (let i = 0; i < placesIdsWithExpiredStreamings.length; i += BATCH_SIZE) {
            const batch = placesIdsWithExpiredStreamings.slice(i, i + BATCH_SIZE)
            const batchResults = await places.getPlaceStatusByIds(batch)
            placesWithExpiredStreamings = [...placesWithExpiredStreamings, ...batchResults]
          }

          const placesById = placesWithExpiredStreamings.reduce<
            Record<string, (typeof placesWithExpiredStreamings)[0]>
          >((acc, place) => {
            acc[place.id] = place
            return acc
          }, {})

          for (const expiredStreaming of expiredStreamings) {
            const { ingress_id: ingressId, place_id: placeId } = expiredStreaming
            const place = placesById[placeId]
            try {
              if (ingressId) {
                await livekit.removeIngress(ingressId)
                await sceneStreamAccessManager.killStreaming(ingressId)
              } else {
                // No ingress id (e.g. a legacy Cast 2.0 row): killStreaming is guarded against
                // an empty id, so deactivate by place instead — otherwise this expired row would
                // be re-selected and re-notified on every tick.
                await sceneStreamAccessManager.removeAccess(placeId)
              }
              // Guard against a missing Places lookup: without it, sendNotificationType would
              // throw on `place.id` and turn a normal missing-place into a logged error.
              if (place) {
                await notifications.sendNotificationType(NotificationStreamingType.STREAMING_TIME_EXCEEDED, place)
              }
              logger.info(`Streaming killed for place ${placeId}${ingressId ? ` (ingress ${ingressId} revoked)` : ''}`)
            } catch (error) {
              logger.error(`Error revoking ingress ${ingressId} or killing streaming for place ${placeId}: ${error}`)
            }
          }

          return
        } catch (error) {
          logger.error(`Error while checking places: ${error}`)
        } finally {
          isProcessing = false
        }
      },
      null,
      false,
      'UCT'
    )
    job.start()
  }

  async function stop() {
    job?.stop()
  }

  return {
    start,
    stop
  }
}
