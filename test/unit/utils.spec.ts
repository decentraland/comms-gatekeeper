import { validateFilters, ensureSlashAtTheEnd, getExplorerUrl } from '../../src/logic/utils'

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
