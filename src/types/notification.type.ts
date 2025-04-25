import { NotificationType } from '@dcl/schemas'
import { PlaceAttributes } from './places.type'

export type StreamingMetadata = {
  title: string
  description: string
  position: string
  worldName: string | null
  isWorld: boolean
  url: string
  address: string
  image: string
}

export enum NotificationStreamingType {
  STREAMING_KEY_RESET = NotificationType.STREAMING_KEY_RESET,
  STREAMING_KEY_REVOKE = NotificationType.STREAMING_KEY_REVOKE,
  STREAMING_KEY_EXPIRED = NotificationType.STREAMING_KEY_EXPIRED,
  STREAMING_TIME_EXCEEDED = NotificationType.STREAMING_TIME_EXCEEDED,
  STREAMING_PLACE_UPDATED = NotificationType.STREAMING_PLACE_UPDATED
}

export type Notification = {
  eventKey: string
  type: NotificationStreamingType
  address?: string
  metadata: StreamingMetadata
  timestamp: number
}

export type INotifications = {
  sendNotificationType(
    type: NotificationStreamingType,
    place: Pick<PlaceAttributes, 'world' | 'world_name' | 'base_position'>
  ): Promise<void>
}
