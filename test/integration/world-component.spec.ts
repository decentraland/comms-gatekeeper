import { createWorldsComponent } from '../../src/adapters/worlds'
import { PermissionType } from '../../src/types'
import { InvalidRequestError } from '../../src/types/errors'

describe('WorldComponent', () => {
  const mockFetch = jest.fn()
  let worldsComponent: Awaited<ReturnType<typeof createWorldsComponent>>

  beforeEach(async () => {
    jest.clearAllMocks()

    const mockConfig = {
      requireString: jest.fn().mockImplementation((key) => {
        const values = {
          WORLD_CONTENT_URL: 'https://world-content.test',
          LAMBDAS_URL: 'https://lambdas.test/'
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

    worldsComponent = await createWorldsComponent({
      config: mockConfig,
      cachedFetch: mockCachedFetch,
      logs: mockLogs
    })
  })

  describe('hasWorldOwnerPermission', () => {
    beforeEach(() => {
      const mockNamesResponse = {
        elements: [{ name: 'myworld' }, { name: 'otherworld' }]
      }

      mockFetch.mockImplementation(() => Promise.resolve(mockNamesResponse))
    })

    it('should throw an error when no world name is provided', async () => {
      await expect(worldsComponent.hasWorldOwnerPermission('authAddress', '')).rejects.toThrow(
        'Invalid world name: , should end with .dcl.eth or .eth'
      )

      await expect(worldsComponent.hasWorldOwnerPermission('authAddress', '')).rejects.toBeInstanceOf(
        InvalidRequestError
      )
    })

    it("should throw an error when world name doesn't end with .eth", async () => {
      await expect(worldsComponent.hasWorldOwnerPermission('authAddress', 'myworld')).rejects.toThrow(
        'Invalid world name: myworld, should end with .dcl.eth or .eth'
      )
      await expect(worldsComponent.hasWorldOwnerPermission('authAddress', 'myworld')).rejects.toThrow(
        new InvalidRequestError('Invalid world name: myworld, should end with .dcl.eth or .eth')
      )
    })

    it('should return false when user has no name elements', async () => {
      mockFetch.mockResolvedValueOnce({ elements: [] })
      const result = await worldsComponent.hasWorldOwnerPermission('authAddress', 'myworld.eth')
      expect(result).toBe(false)
    })

    it('should return true when world name exactly matches a user name', async () => {
      const result = await worldsComponent.hasWorldOwnerPermission('authAddress', 'myworld.eth')
      expect(result).toBe(true)
    })

    it('should be case insensitive when matching names', async () => {
      const result = await worldsComponent.hasWorldOwnerPermission('authAddress', 'MyWorld.eth')
      expect(result).toBe(true)
    })

    it('should strip .dcl.eth suffix when matching names', async () => {
      const result = await worldsComponent.hasWorldOwnerPermission('authAddress', 'myworld.dcl.eth')
      expect(result).toBe(true)
    })

    it('should return false when name does not match any user name', async () => {
      const result = await worldsComponent.hasWorldOwnerPermission('authAddress', 'unknownworld.eth')
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
            wallets: ['0xuseraddress', '0xotheraddress']
          }
        }
      }

      mockFetch.mockResolvedValueOnce(mockPermissionsWithAllowList)

      const result = await worldsComponent.hasWorldStreamingPermission('0xuseraddress', 'test-world')
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith('https://world-content.test/world/test-world/permissions')
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
            wallets: ['0xotheraddress']
          }
        }
      }

      mockFetch.mockResolvedValueOnce(mockPermissionsWithoutUser)

      const result = await worldsComponent.hasWorldStreamingPermission('0xuseraddress', 'test-world')
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

      const result = await worldsComponent.hasWorldStreamingPermission('0xUserAddress', 'test-world')
      expect(result).toBe(false)
    })

    it('should return false when permissions are not available', async () => {
      mockFetch.mockResolvedValueOnce({})
      const result = await worldsComponent.hasWorldStreamingPermission('0xUserAddress', 'test-world')
      expect(result).toBe(false)
    })
  })

  describe('hasWorldDeployPermission', () => {
    it('should return true when user is in deploy allowlist', async () => {
      const mockPermissionsWithAllowList = {
        permissions: {
          access: {
            type: 'allow-list',
            wallets: ['0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd']
          },
          deployment: {
            type: PermissionType.AllowList,
            wallets: ['0xuseraddress', '0xotheraddress']
          },
          streaming: {
            type: PermissionType.AllowList,
            wallets: []
          }
        }
      }

      mockFetch.mockResolvedValueOnce(mockPermissionsWithAllowList)

      const result = await worldsComponent.hasWorldDeployPermission('0xuseraddress', 'test-world')
      expect(result).toBe(true)
    })

    it('should return false when user is not in deploy allowlist', async () => {
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
            wallets: []
          }
        }
      }

      mockFetch.mockResolvedValueOnce(mockPermissionsWithoutUser)

      const result = await worldsComponent.hasWorldDeployPermission('0xuseraddress', 'test-world')
      expect(result).toBe(false)
    })

    it('should return false when permissions are not available', async () => {
      mockFetch.mockResolvedValueOnce({})
      const result = await worldsComponent.hasWorldDeployPermission('0xUserAddress', 'test-world')
      expect(result).toBe(false)
    })

    it('should return false when permissions are not allowlist type', async () => {
      const mockPermissionsWithOtherType = {
        permissions: {
          access: {
            type: 'allow-list',
            wallets: ['0xd9b96b5dc720fc52bede1ec3b40a930e15f70ddd']
          },
          deployment: {
            type: 'other-type',
            wallets: ['0xUserAddress']
          },
          streaming: {
            type: PermissionType.AllowList,
            wallets: []
          }
        }
      }

      mockFetch.mockResolvedValueOnce(mockPermissionsWithOtherType)

      const result = await worldsComponent.hasWorldDeployPermission('0xUserAddress', 'test-world')
      expect(result).toBe(false)
    })
  })
})
