import { createWorldComponent } from '../../src/adapters/world'
import { PermissionType } from '../../src/types'

describe('WorldComponent', () => {
  const mockFetch = jest.fn()
  let worldComponent: Awaited<ReturnType<typeof createWorldComponent>>

  beforeEach(async () => {
    jest.clearAllMocks()

    const mockConfig = {
      requireString: jest.fn().mockImplementation((key) => {
        const values = {
          WORLD_CONTENT_URL: 'https://world-content.test',
          LAMBDAS_URL: 'https://lambdas.test'
        }
        return Promise.resolve(values[key] || '')
      }),
      getString: jest.fn(),
      getNumber: jest.fn(),
      requireNumber: jest.fn()
    }

    const mockLogs = {
      getLogger: jest.fn().mockReturnValue({
        log: jest.fn(),
        warn: jest.fn(),
        info: jest.fn()
      })
    }

    const mockCachedFetch = {
      cache: jest.fn().mockImplementation(() => ({
        fetch: mockFetch
      }))
    }

    worldComponent = await createWorldComponent({
      config: mockConfig,
      cachedFetch: mockCachedFetch,
      logs: mockLogs
    })
  })

  describe('fetchWorldActionPermissions', () => {
    it('should fetch world permissions correctly', async () => {
      const mockPermissions = {
        permissions: {
          access: {
            type: 'allow-list',
            wallets: ['0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd']
          },
          deployment: {
            type: 'allow-list',
            wallets: []
          },
          streaming: {
            type: 'allow-list',
            wallets: ['0x123456']
          }
        }
      }

      mockFetch.mockResolvedValueOnce(mockPermissions)

      const permissions = await worldComponent.fetchWorldActionPermissions('test-world')
      expect(permissions).toEqual(mockPermissions.permissions)
      expect(mockFetch).toHaveBeenCalledWith('https://world-content.test/world/test-world/permissions')
    })
  })

  describe('hasWorldOwnerPermission', () => {
    beforeEach(() => {
      const mockNamesResponse = {
        elements: [{ name: 'myworld' }, { name: 'otherworld' }]
      }

      mockFetch.mockImplementation(() => Promise.resolve(mockNamesResponse))
    })

    it('should return false when no world name is provided', async () => {
      const result = await worldComponent.hasWorldOwnerPermission('authAddress', '')
      expect(result).toBe(false)
    })

    it("should throw an error when world name doesn't end with .eth", async () => {
      await expect(worldComponent.hasWorldOwnerPermission('authAddress', 'myworld')).rejects.toThrow()
    })

    it('should return false when user has no name elements', async () => {
      mockFetch.mockResolvedValueOnce({ elements: [] })
      const result = await worldComponent.hasWorldOwnerPermission('authAddress', 'myworld.eth')
      expect(result).toBe(false)
    })

    it('should return true when world name exactly matches a user name', async () => {
      const result = await worldComponent.hasWorldOwnerPermission('authAddress', 'myworld.eth')
      expect(result).toBe(true)
    })

    it('should be case insensitive when matching names', async () => {
      const result = await worldComponent.hasWorldOwnerPermission('authAddress', 'MyWorld.eth')
      expect(result).toBe(true)
    })

    it('should strip .dcl.eth suffix when matching names', async () => {
      const result = await worldComponent.hasWorldOwnerPermission('authAddress', 'myworld.dcl.eth')
      expect(result).toBe(true)
    })

    it('should return false when name does not match any user name', async () => {
      const result = await worldComponent.hasWorldOwnerPermission('authAddress', 'unknownworld.eth')
      expect(result).toBe(false)
    })
  })

  describe('hasWorldStreamingPermission', () => {
    it('should return true when user is in streaming allowlist', async () => {
      const mockPermissionsWithAllowList = {
        permissions: {
          access: {
            type: 'allow-list',
            wallets: ['0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd']
          },
          deployment: {
            type: 'allow-list',
            wallets: []
          },
          streaming: {
            type: PermissionType.AllowList,
            wallets: ['0xUserAddress', '0xOtherAddress']
          }
        }
      }

      mockFetch.mockResolvedValueOnce(mockPermissionsWithAllowList)

      const result = await worldComponent.hasWorldStreamingPermission('0xUserAddress', 'test-world')
      expect(result).toBe(true)
    })

    it('should return false when user is not in streaming allowlist', async () => {
      const mockPermissionsWithoutUser = {
        permissions: {
          access: {
            type: 'allow-list',
            wallets: ['0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd']
          },
          deployment: {
            type: 'allow-list',
            wallets: []
          },
          streaming: {
            type: PermissionType.AllowList,
            wallets: ['0xOtherAddress']
          }
        }
      }

      mockFetch.mockResolvedValueOnce(mockPermissionsWithoutUser)

      const result = await worldComponent.hasWorldStreamingPermission('0xUserAddress', 'test-world')
      expect(result).toBe(false)
    })

    it('should return false when streaming permissions are not allowlist type', async () => {
      const mockPermissionsWithOtherType = {
        permissions: {
          access: {
            type: 'allow-list',
            wallets: ['0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd']
          },
          deployment: {
            type: 'allow-list',
            wallets: []
          },
          streaming: {
            type: 'other-type',
            wallets: ['0xUserAddress']
          }
        }
      }

      mockFetch.mockResolvedValueOnce(mockPermissionsWithOtherType)

      const result = await worldComponent.hasWorldStreamingPermission('0xUserAddress', 'test-world')
      expect(result).toBe(false)
    })

    it('should return false when permissions are not available', async () => {
      mockFetch.mockResolvedValueOnce({})
      const result = await worldComponent.hasWorldStreamingPermission('0xUserAddress', 'test-world')
      expect(result).toBe(false)
    })
  })
})
