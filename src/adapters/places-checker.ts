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
      '0 0 0 * * 1', // Every monday at 00:00
      async function () {
        try {
          logger.info(`Looking into active places.`)

          const placesIdWithActiveAdmins = await sceneAdminManager.getPlacesIdWithActiveAdmins()
          if (placesIdWithActiveAdmins.length === 0) {
            logger.info(`No places with active admins found.`)
            return
          }

          const placesFromIds = await places.getPlaceStateById(placesIdWithActiveAdmins)

          const placesDisabled = placesFromIds.filter((place) => place.disabled)

          if (placesDisabled.length > 0) {
            logger.info(`Places disabled found: ${placesDisabled.map((place) => place.id).join(', ')}`)
            return
          }

          await Promise.all([
            ...placesFromIds.map(async (place) => {
              await sceneAdminManager.removeAllAdminsByPlaceId(place.id)
            }),
            ...placesFromIds.map(async (place) => {
              await sceneStreamAccessManager.removeAccess(place.id)
            })
          ])

          logger.info(
            `All admins and stream access removed for places: ${placesFromIds.map((place) => place.id).join(', ')}`
          )
          return
        } catch (error) {
          logger.warn(`Error while checking places: ${error}`)
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
