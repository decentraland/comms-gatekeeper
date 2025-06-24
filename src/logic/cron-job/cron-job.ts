import { CronJob } from 'cron'
import { AppComponents } from '../../types'
import { ICronJobComponent } from './types'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'

export async function createCronJobComponent(
  components: Pick<AppComponents, 'logs'>,
  fn: () => Promise<void>,
  cronTime: string,
  { waitForCompletion = false, startOnInit = true }: { waitForCompletion?: boolean; startOnInit?: boolean } = {}
): Promise<ICronJobComponent> {
  const { logs } = components
  const logger = logs.getLogger(`cron-job`)
  let job: CronJob

  async function start(): Promise<void> {
    job = CronJob.from({
      cronTime,
      onTick: async function () {
        try {
          await fn()
        } catch (error) {
          logger.error(`Error running job: ${error}`)
        }
      },
      waitForCompletion,
      start: startOnInit,
      timeZone: 'UCT'
    })
  }

  async function stop() {
    job.stop()
  }

  return {
    [START_COMPONENT]: start,
    [STOP_COMPONENT]: stop
  }
}
