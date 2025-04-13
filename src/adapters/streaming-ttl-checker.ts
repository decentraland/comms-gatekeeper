import { AppComponents } from '../types'
import { IPlaceChecker } from '../types/places-checker.type'
import { CronJob } from 'cron'

export async function createStreamingTTLChecker(
  components: Pick<AppComponents, 'logs' | 'sceneStreamAccessManager' | 'livekit'>
): Promise<IPlaceChecker> {
  const { logs, sceneStreamAccessManager, livekit } = components
  const logger = logs.getLogger(`streaming-ttl-checker`)
  let job: CronJob
  async function start(): Promise<void> {
    job = new CronJob(
      '* * * * *',
      async function () {
        try {
          logger.info(`Looking into active streamings.`)

          const activeStreamings = await sceneStreamAccessManager.getActiveStreamings()
          logger.info(`Found ${activeStreamings.length} active streamings to verify.`)

          const MAX_STREAMING_TIME = 4 * 60 * 60 * 1000 // 4 hours
          const now = Date.now()

          const expiredStreamings = activeStreamings.filter(
            (streaming) => now - streaming.created_at > MAX_STREAMING_TIME
          )

          if (expiredStreamings.length > 0) {
            logger.info(`Found ${expiredStreamings.length} streamings that exceed the maximum allowed time.`)

            const ingressIdsToRevoke = expiredStreamings.map((streaming) => streaming.ingress_id)

            await Promise.all(
              ingressIdsToRevoke.map(async (ingressId) => {
                try {
                  await livekit.removeIngress(ingressId)
                  await sceneStreamAccessManager.killStreaming(ingressId)
                  logger.info(`Ingress ${ingressId} revoked correctly from LiveKit and streaming killed`)
                } catch (error) {
                  logger.error(`Error revoking ingress ${ingressId} or killing streaming: ${error}`)
                }
              })
            )

            logger.info(`${expiredStreamings.length} streaming keys revoked for exceeding the maximum allowed time.`)
          }
          return
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
