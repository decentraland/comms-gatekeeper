import { validateFilters, ensureSlashAtTheEnd, fetchBlacklistedWallets } from '../../src/controllers/handlers/utils'

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

describe('fetchBlacklistedWallets', () => {
  let originalFetch: any

  beforeEach(() => {
    originalFetch = global.fetch
    global.fetch = jest.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('should return a set of blacklisted wallets', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        users: [{ wallet: '0x123' }, { wallet: '0xABC' }]
      })
    }

    global.fetch = jest.fn().mockResolvedValue(mockResponse)

    const result = await fetchBlacklistedWallets('https://example.com/blacklist.json')

    expect(result).toBeInstanceOf(Set)
    expect(result.has('0x123')).toBe(true)
    expect(result.has('0xabc')).toBe(true)
    expect(result.size).toBe(2)
  })

  it('should handle fetch errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

    let error: Error | null = null
    try {
      await fetchBlacklistedWallets('https://example.com/blacklist.json')
    } catch (e) {
      error = e as Error
    }

    expect(error).not.toBeNull()
    expect(error?.message).toContain('Network error')

    consoleErrorSpy.mockRestore()
  })

  it('should handle invalid response format', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        notUsers: []
      })
    }

    global.fetch = jest.fn().mockResolvedValue(mockResponse)

    const result = await fetchBlacklistedWallets('https://example.com/blacklist.json')

    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)

    consoleWarnSpy.mockRestore()
  })
})
