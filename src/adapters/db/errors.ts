export class RoomDoesNotExistError extends Error {
  constructor(roomName: string) {
    super(`Room ${roomName} does not exist`)
  }
}
