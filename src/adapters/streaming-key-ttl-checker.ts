import { isErrorWithMessage } from '../logic/errors'
import { AppComponents } from '../types'
import { IStreamingKeyChecker } from '../types/checker.type'
import { CronJob } from 'cron'
import { NotificationStreamingType } from '../types/notification.type'

export async function createStreamingKeyTTLChecker(
  components: Pick<AppComponents, 'logs' | 'sceneStreamAccessManager' | 'livekit' | 'places' | 'notifications'>
): Promise<IStreamingKeyChecker> {
  const { logs, sceneStreamAccessManager, livekit, places, notifications } = components
  const logger = logs.getLogger(`streaming-key-ttl-checker`)
  let job: CronJob

  async function start(): Promise<void> {
    job = new CronJob(
      '*/10 * * * *', // every 10 minutes
      async function () {
        try {
          logger.info(`Running job to remove expired streaming keys.`)

          const expiredStreamingKeys = await sceneStreamAccessManager.getExpiredStreamingKeys()
          logger.info(`Found ${expiredStreamingKeys.length} expired streaming keys.`)

          if (expiredStreamingKeys.length === 0) {
            return
          }

          const placesIdsWithExpiredKeys = expiredStreamingKeys.map((streaming) => streaming.place_id)

          const placesWithExpiredKeys = await places.getPlaceStatusById(placesIdsWithExpiredKeys)

          const placesById = placesWithExpiredKeys.reduce<Record<string, (typeof placesWithExpiredKeys)[0]>>(
            (acc, place) => {
              acc[place.id] = place
              return acc
            },
            {}
          )

          for (const expiredStreamKey of expiredStreamingKeys) {
            const { ingress_id: ingressId, place_id: placeId } = expiredStreamKey
            const place = placesById[placeId]
            await livekit.removeIngress(ingressId)
            await sceneStreamAccessManager.removeAccess(placeId)
            await notifications.sendNotificationType(NotificationStreamingType.STREAMING_KEY_EXPIRED, place)
          }
        } catch (error) {
          logger.error(
            `Error while removing expired streaming keys: ${isErrorWithMessage(error) ? error.message : 'Unknown error'}`
          )
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
