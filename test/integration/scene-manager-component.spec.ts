import { createSceneManagerComponent } from '../../src/adapters/scene-manager'
import { PlaceAttributes } from '../../src/types/places.type'
import { ISceneManager } from '../../src/types/scene-manager.type'

describe('SceneManagerComponent', () => {
  const mockWorldOwnerPermission = jest.fn()
  const mockWorldStreamingPermission = jest.fn()
  const mockLandPermission = jest.fn()
  const mockIsAdmin = jest.fn()

  const mockWorld = {
    fetchWorldActionPermissions: jest.fn(),
    hasWorldOwnerPermission: mockWorldOwnerPermission,
    hasWorldStreamingPermission: mockWorldStreamingPermission
  }

  const mockSceneAdminManager = {
    isAdmin: mockIsAdmin,
    addAdmin: jest.fn(),
    removeAdmin: jest.fn(),
    listActiveAdmins: jest.fn()
  }

  const mockLand = {
    hasLandPermission: mockLandPermission
  }

  let sceneManager: ISceneManager

  beforeEach(async () => {
    jest.clearAllMocks()

    sceneManager = await createSceneManagerComponent({
      lands: mockLand,
      worlds: mockWorld as any,
      sceneAdminManager: mockSceneAdminManager as any
    })
  })

  const mockScenePlace: PlaceAttributes = {
    id: 'place-123',
    title: 'Test Place',
    description: null,
    image: null,
    highlighted_image: null,
    owner: '0xowner',
    positions: ['0,0'],
    base_position: '0,0',
    contact_name: null,
    contact_email: null,
    likes: 0,
    dislikes: 0,
    favorites: 0,
    like_rate: null,
    like_score: null,
    highlighted: false,
    disabled: false,
    disabled_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    world: false,
    world_name: null,
    deployed_at: new Date(),
    categories: [],
    user_like: false,
    user_dislike: false,
    user_favorite: false,
    user_count: 0,
    user_visits: 0
  }

  const mockWorldPlace: PlaceAttributes = {
    id: 'world-123',
    title: 'Test World',
    description: null,
    image: null,
    highlighted_image: null,
    owner: '0xowner',
    positions: [],
    base_position: '0,0',
    contact_name: null,
    contact_email: null,
    likes: 0,
    dislikes: 0,
    favorites: 0,
    like_rate: null,
    like_score: null,
    highlighted: false,
    disabled: false,
    disabled_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    world: true,
    world_name: 'test-world.eth',
    deployed_at: new Date(),
    categories: [],
    user_like: false,
    user_dislike: false,
    user_favorite: false,
    user_count: 0,
    user_visits: 0
  }

  describe('isSceneOwner', () => {
    it('should call hasWorldOwnerPermission for a world', async () => {
      mockWorldOwnerPermission.mockResolvedValue(true)

      const result = await sceneManager.isSceneOwner(mockWorldPlace, '0xuser')

      expect(mockWorldOwnerPermission).toHaveBeenCalledWith('0xuser', 'test-world.eth')
      expect(result).toBe(true)
    })

    it('should call hasLandPermission for a scene', async () => {
      mockLandPermission.mockResolvedValue(true)

      const result = await sceneManager.isSceneOwner(mockScenePlace, '0xuser')

      expect(mockLandPermission).toHaveBeenCalledWith('0xuser', ['0,0'])
      expect(result).toBe(true)
    })

    it('should return false if user is not owner of a world', async () => {
      mockWorldOwnerPermission.mockResolvedValue(false)

      const result = await sceneManager.isSceneOwner(mockWorldPlace, '0xuser')

      expect(result).toBe(false)
    })

    it('should return false if user is not owner of a scene', async () => {
      mockLandPermission.mockResolvedValue(false)

      const result = await sceneManager.isSceneOwner(mockScenePlace, '0xuser')

      expect(result).toBe(false)
    })
  })

  describe('hasPermissionPrivilege', () => {
    it('should return true if user is the owner of a world', async () => {
      mockWorldOwnerPermission.mockResolvedValue(true)
      mockIsAdmin.mockResolvedValue(false)

      const result = await sceneManager.hasPermissionPrivilege(mockWorldPlace, '0xuser')

      expect(result).toBe(true)
    })

    it('should return true if user is an admin of a world', async () => {
      mockWorldOwnerPermission.mockResolvedValue(false)
      mockIsAdmin.mockResolvedValue(true)

      const result = await sceneManager.hasPermissionPrivilege(mockWorldPlace, '0xuser')

      expect(result).toBe(true)
    })

    it('should return true if user has streaming permission for a world', async () => {
      mockWorldOwnerPermission.mockResolvedValue(false)
      mockIsAdmin.mockResolvedValue(false)
      mockWorldStreamingPermission.mockResolvedValue(true)

      const result = await sceneManager.hasPermissionPrivilege(mockWorldPlace, '0xuser')

      expect(result).toBe(true)
    })

    it('should return true if user is the owner of a scene', async () => {
      mockLandPermission.mockResolvedValue(true)
      mockIsAdmin.mockResolvedValue(false)

      const result = await sceneManager.hasPermissionPrivilege(mockScenePlace, '0xuser')

      expect(result).toBe(true)
    })

    it('should return true if user is an admin of a scene', async () => {
      mockLandPermission.mockResolvedValue(false)
      mockIsAdmin.mockResolvedValue(true)

      const result = await sceneManager.hasPermissionPrivilege(mockScenePlace, '0xuser')

      expect(result).toBe(true)
    })

    it('should return false if user has no privileges for a scene', async () => {
      mockLandPermission.mockResolvedValue(false)
      mockIsAdmin.mockResolvedValue(false)

      const result = await sceneManager.hasPermissionPrivilege(mockScenePlace, '0xuser')

      expect(result).toBe(false)
    })

    it('should return false if user has no privileges for a world', async () => {
      mockWorldOwnerPermission.mockResolvedValue(false)
      mockIsAdmin.mockResolvedValue(false)
      mockWorldStreamingPermission.mockResolvedValue(false)

      const result = await sceneManager.hasPermissionPrivilege(mockWorldPlace, '0xuser')

      expect(result).toBe(false)
    })
  })
})
