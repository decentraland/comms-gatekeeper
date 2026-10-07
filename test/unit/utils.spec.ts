import {
  validateFilters,
  ensureSlashAtTheEnd,
  getExplorerUrl,
  isPlaceRemoved,
  isValidPresenterIdentity
} from '../../src/logic/utils'

describe('ensureSlashAtTheEnd', () => {
  it('should add a trailing slash if not present', () => {
    expect(ensureSlashAtTheEnd('https://example.com')).toBe('https://example.com/')
  })

  it('should not add a trailing slash if already present', () => {
    expect(ensureSlashAtTheEnd('https://example.com/')).toBe('https://example.com/')
  })

  it('should return undefined for empty string', () => {
    expect(ensureSlashAtTheEnd('')).toBeUndefined()
  })
})

describe('validateFilters', () => {
  it('should validate object with valid admin', () => {
    const result = validateFilters({ admin: '0x123' })
    expect(result.valid).toBe(true)
    expect(result.value.admin).toBe('0x123')
  })

  it('should convert admin to lowercase', () => {
    const result = validateFilters({ admin: '0xABC' })
    expect(result.valid).toBe(true)
    expect(result.value.admin).toBe('0xabc')
  })

  it('should accept undefined values', () => {
    const result = validateFilters({})
    expect(result.valid).toBe(true)
    expect(result.value.admin).toBeUndefined()
  })

  it('should reject non-string admin', () => {
    const result = validateFilters({ admin: 123 as any })
    expect(result.valid).toBe(false)
    expect(result.error).toBe('admin must be a string')
  })
})

describe('getExplorerUrl', () => {
  it('should return URL with position parameter for non-world places', () => {
    const place = {
      world: false,
      world_name: 'test-world',
      base_position: '10,20'
    }
    expect(getExplorerUrl(place)).toBe('https://decentraland.org/jump/?position=10,20')
  })

  it('should return URL with realm parameter for world places', () => {
    const place = {
      world: true,
      world_name: 'test-world',
      base_position: '10,20'
    }
    expect(getExplorerUrl(place)).toBe('https://decentraland.org/jump/?realm=test-world')
  })
})

describe('isPlaceRemoved', () => {
  describe('when the place is enabled', () => {
    it('should return false', () => {
      expect(isPlaceRemoved({ disabled: false, disabled_reason: null })).toBe(false)
    })
  })

  describe('when the place is disabled because the world owner opted out', () => {
    it('should return false', () => {
      expect(isPlaceRemoved({ disabled: true, disabled_reason: 'opt_out' })).toBe(false)
    })
  })

  describe.each(['undeployment', 'overwritten', 'moderation'] as const)(
    'when the place is disabled for %s',
    (reason) => {
      it('should return true', () => {
        expect(isPlaceRemoved({ disabled: true, disabled_reason: reason })).toBe(true)
      })
    }
  )

  describe('when the place is disabled with a null reason', () => {
    it('should return true', () => {
      expect(isPlaceRemoved({ disabled: true, disabled_reason: null })).toBe(true)
    })
  })

  describe('when the place is disabled and Places sent no reason', () => {
    it('should return true', () => {
      expect(isPlaceRemoved({ disabled: true })).toBe(true)
    })
  })
})

describe('when validating presenter identities', () => {
  describe.each([
    ['wallet', '0x1234567890abcdef1234567890abcdef12345678', true],
    ['preview streamer', 'stream:scene:localpreview:id:a1b2c3d4-e5f6-7890-abcd-ef1234567890', true],
    ['base64 preview', 'stream:scene:localpreview:b64-Ab+/==:a1b2c3d4-e5f6-7890-abcd-ef1234567890', true],
    ['whitespace', 'stream:bad place:a1b2c3d4-e5f6-7890-abcd-ef1234567890', false],
    ['control character', 'stream:bad\tplace:a1b2c3d4-e5f6-7890-abcd-ef1234567890', false],
    ['markup', 'stream:<place>:a1b2c3d4-e5f6-7890-abcd-ef1234567890', false],
    ['missing place', 'stream::a1b2c3d4-e5f6-7890-abcd-ef1234567890', false],
    ['watcher', 'watch:place:a1b2c3d4-e5f6-7890-abcd-ef1234567890', false],
    ['invalid UUID', 'stream:place:not-a-uuid', false],
    ['oversized identity', `stream:${'p'.repeat(512)}:a1b2c3d4-e5f6-7890-abcd-ef1234567890`, false]
  ])('and the identity is a %s', (_label, value, expected) => {
    let identity: string

    beforeEach(() => {
      identity = String(value)
    })

    it('should enforce the bounded presenter identity format', () => {
      expect(isValidPresenterIdentity(identity)).toBe(expected)
    })
  })
})
