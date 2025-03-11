import { validateFilters, ensureSlashAtTheEnd } from '../../src/controllers/handlers/utils'

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
