import { AppComponents } from '../types'
import { IPlaceChecker } from '../types/checker.type'
import { CronJob } from 'cron'
import { NotificationStreamingType } from '../types/notification.type'
import { PlaceAttributes } from '../types/places.type'

export async function createPlaceChecker(
  components: Pick<
    AppComponents,
    'logs' | 'sceneAdminManager' | 'sceneStreamAccessManager' | 'places' | 'notifications' | 'livekit'
  >
): Promise<IPlaceChecker> {
  const { logs, sceneAdminManager, sceneStreamAccessManager, places, notifications, livekit } = components
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

          let placesFromIds: Array<
            Pick<PlaceAttributes, 'id' | 'disabled' | 'world' | 'world_name' | 'base_position' | 'positions'>
          > = []
          const batchSize = 100

          for (let i = 0; i < placesIdWithActiveAdmins.length; i += batchSize) {
            const batch = placesIdWithActiveAdmins.slice(i, i + batchSize)
            const batchResult = await places.getPlaceStatusByIds(batch)
            placesFromIds = placesFromIds.concat(batchResult)
          }

          const placesDisabled = placesFromIds.filter((place) => place.disabled)
          if (placesDisabled.length === 0) {
            return
          }
          logger.info(`Places disabled found: ${placesDisabled.map((place) => place.id).join(', ')}`)

          const disabledPlaceIds = placesDisabled.map((place) => place.id)

          // Clean up ingresses from LiveKit before deactivating DB records
          const placesWithFailedIngress = new Set<string>()
          for (const placeId of disabledPlaceIds) {
            const ingressIds = await sceneStreamAccessManager.getActiveIngressIds(placeId)
            for (const ingressId of ingressIds) {
              try {
                await livekit.removeIngress(ingressId)
                logger.info(`Removed ingress ${ingressId} for disabled place ${placeId}`)
              } catch (error) {
                logger.warn(`Failed to remove ingress ${ingressId} for disabled place ${placeId}: ${error}`)
                placesWithFailedIngress.add(placeId)
              }
            }
          }

          const placeIdsToClean = disabledPlaceIds.filter((id) => !placesWithFailedIngress.has(id))
          const placeIdsSkipped = disabledPlaceIds.filter((id) => placesWithFailedIngress.has(id))

          if (placeIdsSkipped.length > 0) {
            logger.warn(
              `Skipping stream access removal for places with failed ingress cleanup: ${placeIdsSkipped.join(', ')}`
            )
          }

          if (placeIdsToClean.length > 0) {
            await Promise.all([
              sceneAdminManager.removeAllAdminsByPlaceIds(placeIdsToClean),
              sceneStreamAccessManager.removeAccessByPlaceIds(placeIdsToClean)
            ])
            logger.info(`All admins and stream access removed for places: ${placeIdsToClean.join(', ')}`)
          }

          const cleanedPlaces = placesDisabled.filter((place) => !placesWithFailedIngress.has(place.id))
          for (const place of cleanedPlaces) {
            try {
              await notifications.sendNotificationType(NotificationStreamingType.STREAMING_PLACE_UPDATED, place)
            } catch (error) {
              logger.error(`Error sending notification for place ${place.id}: ${error}`)
            }
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
