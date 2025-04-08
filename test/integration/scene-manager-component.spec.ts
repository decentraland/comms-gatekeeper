import { test } from '../components'
import { createSceneManagerComponent } from '../../src/adapters/scene-manager'
import { PlaceAttributes } from '../../src/types/places.type'
import { ISceneManager } from '../../src/types/scene-manager.type'

test('SceneManagerComponent', ({ stubComponents }) => {
  const testPlaceId = `place-id-test`
  const testAddress = '0x123'
  const testParcel = '10,20'
  let sceneManager: ISceneManager
  let scenePlace: PlaceAttributes
  let worldPlace: PlaceAttributes

  beforeEach(async () => {
    stubComponents.worlds.hasWorldOwnerPermission.resolves(false)
    stubComponents.worlds.hasWorldStreamingPermission.resolves(false)
    stubComponents.worlds.hasWorldDeployPermission.resolves(false)
    stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: false })
    stubComponents.sceneAdminManager.isAdmin.resolves(false)

    sceneManager = await createSceneManagerComponent({
      worlds: stubComponents.worlds,
      lands: stubComponents.lands,
      sceneAdminManager: stubComponents.sceneAdminManager
    })

    scenePlace = {
      id: testPlaceId,
      world: false,
      positions: [testParcel]
    } as PlaceAttributes

    worldPlace = {
      id: testPlaceId,
      world: true,
      world_name: 'test-world'
    } as PlaceAttributes
  })

  describe('isSceneOwner', () => {
    it('should return true when user has world owner permission', async () => {
      stubComponents.worlds.hasWorldOwnerPermission.resolves(true)
      const result = await sceneManager.isSceneOwner(worldPlace, testAddress)
      expect(result).toBe(true)
    })

    it('should return true when user has land owner permission', async () => {
      stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
      const result = await sceneManager.isSceneOwner(scenePlace, testAddress)
      expect(result).toBe(true)
    })

    it('should return false when user has no permissions', async () => {
      const result = await sceneManager.isSceneOwner(scenePlace, testAddress)
      expect(result).toBe(false)
    })
  })

  describe('getUserScenePermissions', () => {
    it('should return owner=true if user is the owner of a world', async () => {
      stubComponents.worlds.hasWorldOwnerPermission.resolves(true)
      const result = await sceneManager.getUserScenePermissions(worldPlace, testAddress)
      expect(result).toEqual({
        owner: true,
        admin: false,
        hasExtendedPermissions: false
      })
    })

    it('should return admin=true if user is an admin of a world', async () => {
      stubComponents.sceneAdminManager.isAdmin.resolves(true)
      const result = await sceneManager.getUserScenePermissions(worldPlace, testAddress)
      expect(result).toEqual({
        owner: false,
        admin: true,
        hasExtendedPermissions: false
      })
    })

    it('should return hasExtendedPermissions=true if user has streaming permission for a world', async () => {
      stubComponents.worlds.hasWorldStreamingPermission.resolves(true)
      const result = await sceneManager.getUserScenePermissions(worldPlace, testAddress)
      expect(result).toEqual({
        owner: false,
        admin: false,
        hasExtendedPermissions: true
      })
    })

    it('should return hasExtendedPermissions=true if user has deploy permission for a world', async () => {
      stubComponents.worlds.hasWorldDeployPermission.resolves(true)
      const result = await sceneManager.getUserScenePermissions(worldPlace, testAddress)
      expect(result).toEqual({
        owner: false,
        admin: false,
        hasExtendedPermissions: true
      })
    })

    it('should return hasExtendedPermissions=true if user is an operator of a scene', async () => {
      stubComponents.lands.getLandUpdatePermission.resolves({ owner: false, operator: true })
      const result = await sceneManager.getUserScenePermissions(scenePlace, testAddress)
      expect(result).toEqual({
        owner: false,
        admin: false,
        hasExtendedPermissions: true
      })
    })

    it('should return all false if user has no privileges for a scene', async () => {
      const result = await sceneManager.getUserScenePermissions(scenePlace, testAddress)
      expect(result).toEqual({
        owner: false,
        admin: false,
        hasExtendedPermissions: false
      })
    })

    it('should return all false if user has no privileges for a world', async () => {
      const result = await sceneManager.getUserScenePermissions(worldPlace, testAddress)
      expect(result).toEqual({
        owner: false,
        admin: false,
        hasExtendedPermissions: false
      })
    })
  })

  describe('isSceneOwnerOrAdmin', () => {
    it('should return true when user is owner', async () => {
      stubComponents.lands.getLandUpdatePermission.resolves({ owner: true, operator: false })
      const result = await sceneManager.isSceneOwnerOrAdmin(scenePlace, testAddress)
      expect(result).toBe(true)
    })

    it('should return true when user is admin', async () => {
      stubComponents.sceneAdminManager.isAdmin.resolves(true)
      const result = await sceneManager.isSceneOwnerOrAdmin(scenePlace, testAddress)
      expect(result).toBe(true)
    })

    it('should return true when user has extended permissions', async () => {
      stubComponents.worlds.hasWorldStreamingPermission.resolves(true)
      const result = await sceneManager.isSceneOwnerOrAdmin(worldPlace, testAddress)
      expect(result).toBe(true)
    })

    it('should return false when user has no permissions', async () => {
      const result = await sceneManager.isSceneOwnerOrAdmin(scenePlace, testAddress)
      expect(result).toBe(false)
    })
  })
})
