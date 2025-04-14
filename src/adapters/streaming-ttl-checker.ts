import { AppComponents } from '../types'
import { IStreamingChecker } from '../types/checker.type'
import { CronJob } from 'cron'

export async function createStreamingTTLChecker(
  components: Pick<AppComponents, 'logs' | 'sceneStreamAccessManager' | 'livekit'>
): Promise<IStreamingChecker> {
  const { logs, sceneStreamAccessManager, livekit } = components
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

          const ingressIdsToRevoke = expiredStreamings.map((streaming) => streaming.ingress_id)

          for (const ingressId of ingressIdsToRevoke) {
            try {
              await livekit.removeIngress(ingressId)
              await sceneStreamAccessManager.killStreaming(ingressId)
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
