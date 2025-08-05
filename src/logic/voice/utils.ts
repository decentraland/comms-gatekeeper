export const COMMUNITY_VOICE_CHAT_ROOM_PREFIX = 'voice-chat-community'

export function getPrivateVoiceChatRoomName(roomId: string): string {
  return `voice-chat-private-${roomId}`
}

export function getCallIdFromRoomName(roomName: string): string {
  return roomName.replace('voice-chat-private-', '')
}

export function getCommunityVoiceChatRoomName(communityId: string): string {
  return `${COMMUNITY_VOICE_CHAT_ROOM_PREFIX}-${communityId}`
}

export function getCommunityIdFromRoomName(roomName: string): string {
  return roomName.replace(`${COMMUNITY_VOICE_CHAT_ROOM_PREFIX}-`, '')
}
