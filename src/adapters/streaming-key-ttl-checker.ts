import { FOUR_DAYS } from '../logic/time'
import { AppComponents } from '../types'
import { IStreamingKeyChecker } from '../types/checker.type'
import { CronJob } from 'cron'

export async function createStreamingKeyTTLChecker(
  components: Pick<AppComponents, 'logs' | 'sceneStreamAccessManager'>
): Promise<IStreamingKeyChecker> {
  const { logs, sceneStreamAccessManager } = components
  const logger = logs.getLogger(`streaming-key-ttl-checker`)
  let job: CronJob

  async function start(): Promise<void> {
    job = new CronJob(
      '*/10 * * * *', // every 10 minutes
      async function () {
        try {
          logger.info(`Looking into active streamings.`)

          const activeStreamingKeys = await sceneStreamAccessManager.getActiveStreamingKeys()
          logger.info(`Found ${activeStreamingKeys.length} active streamings to verify.`)

          const now = Date.now()
          const expiredStreamingsKeys = activeStreamingKeys.filter(
            (streaming) => now - streaming.created_at > FOUR_DAYS
          )

          if (expiredStreamingsKeys.length === 0) {
            return
          }

          logger.info(`Found ${expiredStreamingsKeys.length} streaming keys that exceed the maximum allowed time.`)

          const nonActiveStreamingsExpired = expiredStreamingsKeys.filter((streaming) => streaming.streaming === false)

          if (nonActiveStreamingsExpired.length !== expiredStreamingsKeys.length) {
            logger.info(
              `There are ${expiredStreamingsKeys.length - nonActiveStreamingsExpired.length} streamings that are active and will not be revoked.`
            )
          }

          await Promise.all(
            nonActiveStreamingsExpired.map(async (streaming) => {
              await sceneStreamAccessManager.removeAccess(streaming.place_id)
            })
          )
        } catch (error) {
          logger.error(`Error while checking places: ${error}`)
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
