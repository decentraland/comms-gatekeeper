export enum AnalyticsEvent {
  PARTICIPANT_JOINED_ROOM = 'PEER_JOINED_ROOM',
  PARTICIPANT_LEFT_ROOM = 'PEER_LEFT_ROOM',
  EXPIRE_CALL = 'EXPIRE_CALL',
  END_CALL = 'END_CALL'
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
}
