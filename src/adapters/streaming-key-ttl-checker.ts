import { isErrorWithMessage } from '../logic/errors'
import { AppComponents } from '../types'
import { IStreamingKeyChecker } from '../types/checker.type'
import { CronJob } from 'cron'

export async function createStreamingKeyTTLChecker(
  components: Pick<AppComponents, 'logs' | 'sceneStreamAccessManager' | 'livekit'>
): Promise<IStreamingKeyChecker> {
  const { logs, sceneStreamAccessManager, livekit } = components
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

          for (const expiredKey of expiredStreamingKeys) {
            await livekit.removeIngress(expiredKey.ingress_id)
            await sceneStreamAccessManager.removeAccess(expiredKey.place_id)
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
