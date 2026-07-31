import { islandRoomName } from '../../../src/logic/cluster-subscriber/rooms'

describe('cluster-subscriber rooms', () => {
  describe('when resolving a room name for a cluster', () => {
    it('should prefix the cluster id with island-', () => {
      expect(islandRoomName('C12')).toBe('island-C12')
    })

    it('should use the cluster id verbatim, with no other transformation', () => {
      expect(islandRoomName('C-99-main')).toBe('island-C-99-main')
    })
  })
})
