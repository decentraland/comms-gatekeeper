import { isValidAddress, formatUrl, validateFilters } from '../../src/controllers/handlers/utils'

describe('isValidAddress', () => {
  it('should return true for valid ethereum addresses', () => {
    expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true)
    expect(isValidAddress('0xabcdef7890123456789012345678901234567890')).toBe(true)
    expect(isValidAddress('0xABCDEF7890123456789012345678901234567890')).toBe(true)
    expect(isValidAddress('0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5')).toBe(true)
  })

  it('should return false for invalid ethereum addresses', () => {
    expect(isValidAddress('1234567890123456789012345678901234567890')).toBe(false)
    expect(isValidAddress('0x123456789012345678901234567890123456')).toBe(false)
    expect(isValidAddress('0x12345678901234567890123456789012345678901234')).toBe(false)
    expect(isValidAddress('0x123456789012345678901234567890123456789g')).toBe(false)
    expect(isValidAddress('0x123456789012345678901234567890123456789Z')).toBe(false)
    expect(isValidAddress('0x12345678901234567890123456789012345678-0')).toBe(false)
  })

  it('should return false for non-string or empty values', () => {
    expect(isValidAddress('')).toBe(false)
    expect(isValidAddress(null as any)).toBe(false)
    expect(isValidAddress(undefined as any)).toBe(false)
    expect(isValidAddress(123 as any)).toBe(false)
    expect(isValidAddress({} as any)).toBe(false)
  })
})

describe('formatUrl', () => {
  it('should add a trailing slash if not present', () => {
    expect(formatUrl('https://example.com')).toBe('https://example.com/')
  })

  it('should not add a trailing slash if already present', () => {
    expect(formatUrl('https://example.com/')).toBe('https://example.com/')
  })

  it('should handle empty string', () => {
    expect(formatUrl('')).toBe('/')
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
