import {
  hasLandPermission,
  hasWorldPermission,
  isPlaceAdmin,
  isValidAddress,
  formatUrl,
  validateFilters
} from '../../src/controllers/handlers/utils'
import { ISceneAdminManager } from '../../src/adapters/scene-admin-manager'

describe('hasLandPermission', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              { category: 'parcel', x: '10', y: '20' },
              { category: 'parcel', x: '30', y: '40' }
            ]
          })
      })
    ) as jest.Mock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should return false when no positions are provided', async () => {
    const result = await hasLandPermission('lambdasUrl', 'authAddress', [])
    expect(result).toBe(false)
  })

  it('should return false when user has no land elements', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ elements: [] })
      })
    ) as jest.Mock

    const result = await hasLandPermission('lambdasUrl', 'authAddress', ['10,20'])
    expect(result).toBe(false)
  })

  it('should return true when a position matches user land', async () => {
    const result = await hasLandPermission('lambdasUrl', 'authAddress', ['10,20', '50,60'])
    expect(result).toBe(true)
  })

  it('should return false when no positions match user land', async () => {
    const result = await hasLandPermission('lambdasUrl', 'authAddress', ['50,60', '70,80'])
    expect(result).toBe(false)
  })
})

describe('hasWorldPermission', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            elements: [{ name: 'myworld' }, { name: 'otherworld' }]
          })
      })
    ) as jest.Mock
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should return false when no world name is provided', async () => {
    const result = await hasWorldPermission('lambdasUrl', 'authAddress', '')
    expect(result).toBe(false)
  })

  it('should return false when user has no name elements', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ elements: [] })
      })
    ) as jest.Mock

    const result = await hasWorldPermission('lambdasUrl', 'authAddress', 'myworld')
    expect(result).toBe(false)
  })

  it('should return true when world name exactly matches a user name', async () => {
    const result = await hasWorldPermission('lambdasUrl', 'authAddress', 'myworld')
    expect(result).toBe(true)
  })

  it('should be case insensitive when matching names', async () => {
    const result = await hasWorldPermission('lambdasUrl', 'authAddress', 'MyWorld')
    expect(result).toBe(true)
  })

  it('should strip .dcl.eth suffix when matching names', async () => {
    const result = await hasWorldPermission('lambdasUrl', 'authAddress', 'myworld.dcl.eth')
    expect(result).toBe(true)
  })

  it('should strip .eth suffix when matching names', async () => {
    const result = await hasWorldPermission('lambdasUrl', 'authAddress', 'myworld.eth')
    expect(result).toBe(true)
  })

  it('should return false when name does not match any user name', async () => {
    const result = await hasWorldPermission('lambdasUrl', 'authAddress', 'unknownworld')
    expect(result).toBe(false)
  })
})

describe('isPlaceAdmin', () => {
  it('should return true when user is admin', async () => {
    const mockSceneAdminManager = {
      isAdmin: jest.fn().mockResolvedValue(true)
    } as unknown as ISceneAdminManager

    const result = await isPlaceAdmin(mockSceneAdminManager, 'place123', '0x123')

    expect(result).toBe(true)
    expect(mockSceneAdminManager.isAdmin).toHaveBeenCalledWith('place123', '0x123')
  })

  it('should return false when user is not admin', async () => {
    const mockSceneAdminManager = {
      isAdmin: jest.fn().mockResolvedValue(false)
    } as unknown as ISceneAdminManager

    const result = await isPlaceAdmin(mockSceneAdminManager, 'place123', '0x123')

    expect(result).toBe(false)
  })

  it('should handle errors and return false', async () => {
    const mockSceneAdminManager = {
      isAdmin: jest.fn().mockRejectedValue(new Error('Database error'))
    } as unknown as ISceneAdminManager

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await isPlaceAdmin(mockSceneAdminManager, 'place123', '0x123')

    expect(result).toBe(false)
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})

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
