import { buildStreamLinks } from '../../../src/logic/cast/cast'

describe('when building stream links', () => {
  const streamingKey = 'cast2-link-abc123'
  const location = '10,20'

  describe('and using the default base URL', () => {
    it('should build the stream and watcher links with the default cast2 URL', () => {
      const result = buildStreamLinks(undefined, streamingKey, location)

      expect(result.streamLink).toBe('https://cast2.decentraland.org/s/cast2-link-abc123')
      expect(result.watcherLink).toBe('https://cast2.decentraland.org/w/10,20')
    })
  })

  describe('and using a custom base URL', () => {
    const customBaseUrl = 'https://custom-cast.example.com'

    it('should build the stream and watcher links with the custom URL', () => {
      const result = buildStreamLinks(customBaseUrl, streamingKey, location)

      expect(result.streamLink).toBe('https://custom-cast.example.com/s/cast2-link-abc123')
      expect(result.watcherLink).toBe('https://custom-cast.example.com/w/10,20')
    })
  })

  describe('and the location is a world name', () => {
    const worldLocation = 'myworld.dcl.eth'

    it('should build the watcher link with the world name', () => {
      const result = buildStreamLinks('https://cast2.decentraland.org', streamingKey, worldLocation)

      expect(result.watcherLink).toBe('https://cast2.decentraland.org/w/myworld.dcl.eth')
    })
  })

  describe('and the location is a parcel', () => {
    const parcelLocation = '20,-4'

    it('should build the watcher link with the parcel coordinates', () => {
      const result = buildStreamLinks('https://cast2.decentraland.org', streamingKey, parcelLocation)

      expect(result.watcherLink).toBe('https://cast2.decentraland.org/w/20,-4')
    })
  })

  describe('and the streaming key contains special characters', () => {
    const specialKey = 'cast2-link-abc123-def456-xyz'

    it('should build the stream link preserving the special characters', () => {
      const result = buildStreamLinks('https://cast2.decentraland.org', specialKey, location)

      expect(result.streamLink).toBe('https://cast2.decentraland.org/s/cast2-link-abc123-def456-xyz')
    })
  })
})
