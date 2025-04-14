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

          await sceneStreamAccessManager.removeExpiredStreamingKeys()
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
