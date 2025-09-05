export enum AnalyticsEvent {
  PARTICIPANT_JOINED_ROOM = 'PEER_JOINED_ROOM',
  PARTICIPANT_LEFT_ROOM = 'PEER_LEFT_ROOM',
  EXPIRE_CALL = 'EXPIRE_CALL',
  END_CALL = 'END_CALL',
  SCENE_BAN_ADDED = 'SCENE_BAN_ADDED',
  SCENE_BAN_REMOVED = 'SCENE_BAN_REMOVED'
}

export type AnalyticsEventPayload = {
  [AnalyticsEvent.PARTICIPANT_JOINED_ROOM]: {
    room: string
    address: string
  }
  [AnalyticsEvent.PARTICIPANT_LEFT_ROOM]: {
    room: string
    address: string
    reason: string
  }
  [AnalyticsEvent.EXPIRE_CALL]: {
    call_id: string
  }
  [AnalyticsEvent.END_CALL]: {
    call_id: string
    user_id: string
  }
  [AnalyticsEvent.SCENE_BAN_ADDED]: {
    place_id: string
    banned_address: string
    banned_by: string
    banned_at: number
    scene_id?: string
    parcel?: string
    realm_name: string
  }
  [AnalyticsEvent.SCENE_BAN_REMOVED]: {
    place_id: string
    banned_address: string
    unbanned_by: string
    unbanned_at: number
    scene_id?: string
    parcel?: string
    realm_name: string
  }
}
