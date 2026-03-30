import { timingSafeCompare, sanitizeModeratorName } from '../../src/logic/moderator/utils'

describe('timingSafeCompare', () => {
  it('should return true for equal strings', () => {
    expect(timingSafeCompare('abc', 'abc')).toBe(true)
  })

  it('should return false for different strings of the same length', () => {
    expect(timingSafeCompare('abc', 'abd')).toBe(false)
  })

  it('should return false for strings of different lengths', () => {
    expect(timingSafeCompare('abc', 'abcd')).toBe(false)
  })

  it('should return false for empty vs non-empty', () => {
    expect(timingSafeCompare('', 'a')).toBe(false)
  })

  it('should return true for two empty strings', () => {
    expect(timingSafeCompare('', '')).toBe(true)
  })
})

describe('sanitizeModeratorName', () => {
  it('should return trimmed name for valid input', () => {
    expect(sanitizeModeratorName('  John Doe  ')).toBe('John Doe')
  })

  it('should allow alphanumeric characters', () => {
    expect(sanitizeModeratorName('JohnDoe123')).toBe('JohnDoe123')
  })

  it('should allow hyphens, underscores, and dots', () => {
    expect(sanitizeModeratorName('John-Doe_Jr.')).toBe('John-Doe_Jr.')
  })

  it('should return null for empty string', () => {
    expect(sanitizeModeratorName('')).toBeNull()
  })

  it('should return null for whitespace-only string', () => {
    expect(sanitizeModeratorName('   ')).toBeNull()
  })

  it('should return null for string exceeding 100 characters', () => {
    expect(sanitizeModeratorName('a'.repeat(101))).toBeNull()
  })

  it('should accept a string of exactly 100 characters', () => {
    const name = 'a'.repeat(100)
    expect(sanitizeModeratorName(name)).toBe(name)
  })

  it('should return null for names with HTML tags', () => {
    expect(sanitizeModeratorName('<script>alert("xss")</script>')).toBeNull()
  })

  it('should return null for names with SQL-like characters', () => {
    expect(sanitizeModeratorName("Robert'; DROP TABLE users;--")).toBeNull()
  })
})
