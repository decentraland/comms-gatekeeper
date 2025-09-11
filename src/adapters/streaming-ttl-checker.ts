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
              await livekit.removeIngress(ingressId)
              await sceneStreamAccessManager.killStreaming(ingressId)
              await notifications.sendNotificationType(NotificationStreamingType.STREAMING_TIME_EXCEEDED, place)
              logger.info(`Ingress ${ingressId} revoked correctly from LiveKit and streaming killed`)
            } catch (error) {
              logger.error(`Error revoking ingress ${ingressId} or killing streaming: ${error}`)
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
