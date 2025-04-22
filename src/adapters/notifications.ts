import { getNotificationMetadata } from '../logic/utils'
import { AppComponents } from '../types'
import { INotifications, Notification, NotificationStreamingType } from '../types/notification.type'
import { PlaceAttributes } from '../types/places.type'

export async function createNotificationsComponent({
  config,
  fetch,
  logs,
  sceneAdmins
}: Pick<AppComponents, 'config' | 'fetch' | 'logs' | 'sceneAdmins'>): Promise<INotifications> {
  const logger = logs.getLogger('notifications')
  const [notificationServiceUrl, authToken] = await Promise.all([
    config.getString('NOTIFICATION_SERVICE_URL'),
    config.getString('NOTIFICATION_SERVICE_TOKEN')
  ])

  if (!!notificationServiceUrl && !authToken) {
    throw new Error('Notification service URL provided without a token')
  }

  logger.info(`Using notification service at ${notificationServiceUrl}`)

  async function sendNotifications(notifications: Notification[]): Promise<void> {
    logger.info(`Sending ${notifications.length} notifications`, { notifications: JSON.stringify(notifications) })
    await fetch.fetch(`${notificationServiceUrl}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(notifications)
    })
  }

  async function sendNotificationType(
    type: NotificationStreamingType,
    place: Pick<PlaceAttributes, 'id' | 'world' | 'world_name' | 'base_position'>
  ): Promise<void> {
    const { getAdminsAndExtraAddresses } = sceneAdmins

    const { addresses } = await getAdminsAndExtraAddresses(place)

    const notifications: Notification[] = Array.from(addresses).map((address) => ({
      eventKey: `${type}-${place.id}-${Date.now()}`,
      type: type,
      address: address,
      timestamp: Date.now(),
      metadata: {
        ...getNotificationMetadata(type, place),
        address: address
      }
    }))

    await sendNotifications(notifications)
  }

  return {
    sendNotificationType
  }
}
