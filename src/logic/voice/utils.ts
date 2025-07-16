export function getPrivateVoiceChatRoomName(roomId: string): string {
  return `voice-chat-private-${roomId}`
}

export function getCallIdFromRoomName(roomName: string): string {
  return roomName.replace('voice-chat-private-', '')
}

export function getCommunityVoiceChatRoomName(communityId: string): string {
  return `voice-chat-community-${communityId}`
}

export function getCommunityIdFromRoomName(roomName: string): string {
  return roomName.replace('voice-chat-community-', '')
}
