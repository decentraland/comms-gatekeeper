import { AppComponents } from '../types'
import { IPlaceChecker } from '../types/places-checker.type'
import { CronJob } from 'cron'

export async function createPlaceChecker(
  components: Pick<AppComponents, 'logs' | 'sceneAdminManager' | 'sceneStreamAccessManager' | 'places'>
): Promise<IPlaceChecker> {
  const { logs, sceneAdminManager, sceneStreamAccessManager, places } = components
  const logger = logs.getLogger(`mission-checker`)
  let job: CronJob
  async function start(): Promise<void> {
    job = new CronJob(
      '0 * * * * *', //'0 0 0 * * 1', // Every monday at 00:00  - '0 * * * * *'
      async function () {
        try {
          logger.info(`Looking into active places.`)

          const placesIdWithActiveAdmins = await sceneAdminManager.getPlacesIdWithActiveAdmins()
          if (placesIdWithActiveAdmins.length === 0) {
            logger.info(`No places with active admins found.`)
            return
          }

          let placesFromIds: Array<{ id: string; disabled: boolean }> = []
          const batchSize = 100

          const batchPromises = []
          for (let i = 0; i < placesIdWithActiveAdmins.length; i += batchSize) {
            const batch = placesIdWithActiveAdmins.slice(i, i + batchSize)
            batchPromises.push(places.getPlaceStatusById(batch))
          }

          const batchResults = await Promise.all(batchPromises)
          placesFromIds = batchResults.flat()

          const placesDisabled = placesFromIds.filter((place) => place.disabled)
          if (placesDisabled.length === 0) {
            return
          }
          logger.info(`Places disabled found: ${placesDisabled.map((place) => place.id).join(', ')}`)

          await Promise.all([
            sceneAdminManager.removeAllAdminsByPlaceIds(placesDisabled.map((place) => place.id)),
            sceneStreamAccessManager.removeAccessByPlaceIds(placesDisabled.map((place) => place.id))
          ])

          logger.info(
            `All admins and stream access removed for places: ${placesDisabled.map((place) => place.id).join(', ')}`
          )
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
