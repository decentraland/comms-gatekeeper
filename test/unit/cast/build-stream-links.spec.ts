import { buildStreamLinks } from '../../../src/logic/cast/cast'

describe('buildStreamLinks', () => {
  describe('when building stream and watcher links', () => {
    let cast2BaseUrl: string
    let streamingKey: string
    let location: string

    beforeEach(() => {
      cast2BaseUrl = 'https://cast2.decentraland.org'
      streamingKey = 'cast2-link-abc123'
      location = '10,20'
    })

    it('should build correct stream link with parcel location', () => {
      const result = buildStreamLinks(cast2BaseUrl, streamingKey, location)

      expect(result.streamLink).toBe('https://cast2.decentraland.org/s/cast2-link-abc123')
      expect(result.watcherLink).toBe('https://cast2.decentraland.org/w/10,20')
    })

    it('should build correct links with world location', () => {
      location = 'myworld.dcl.eth'

      const result = buildStreamLinks(cast2BaseUrl, streamingKey, location)

      expect(result.streamLink).toBe('https://cast2.decentraland.org/s/cast2-link-abc123')
      expect(result.watcherLink).toBe('https://cast2.decentraland.org/w/myworld.dcl.eth')
    })

    it('should build correct links with fallback location', () => {
      location = 'none'

      const result = buildStreamLinks(cast2BaseUrl, streamingKey, location)

      expect(result.streamLink).toBe('https://cast2.decentraland.org/s/cast2-link-abc123')
      expect(result.watcherLink).toBe('https://cast2.decentraland.org/w/none')
    })

    it('should handle different base URLs', () => {
      cast2BaseUrl = 'http://localhost:3000'

      const result = buildStreamLinks(cast2BaseUrl, streamingKey, location)

      expect(result.streamLink).toBe('http://localhost:3000/s/cast2-link-abc123')
      expect(result.watcherLink).toBe('http://localhost:3000/w/10,20')
    })

    it('should handle streaming keys with special characters', () => {
      streamingKey = 'cast2-link-abc123-def456'

      const result = buildStreamLinks(cast2BaseUrl, streamingKey, location)

      expect(result.streamLink).toBe('https://cast2.decentraland.org/s/cast2-link-abc123-def456')
      expect(result.watcherLink).toBe('https://cast2.decentraland.org/w/10,20')
    })
  })
})
