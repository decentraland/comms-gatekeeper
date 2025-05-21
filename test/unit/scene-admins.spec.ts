import { createSceneAdminsComponent } from '../../src/adapters/scene-admins'
import { SceneAdmin } from '../../src/types'
import { PermissionType } from '../../src/types/worlds.type'

describe('SceneAdmins', () => {
  let mockedComponents: any
  let sceneAdmins: any

  beforeEach(async () => {
    mockedComponents = {
      worlds: {
        fetchWorldActionPermissions: jest.fn()
      },
      lands: {
        getLandOperators: jest.fn()
      },
      sceneAdminManager: {
        listActiveAdmins: jest.fn()
      }
    }

    sceneAdmins = await createSceneAdminsComponent(mockedComponents)
  })

  describe('getAdminsAndExtraAddresses', () => {
    it('should resolve with the world owner, deployers and streamers when place is a world', async () => {
      const place = {
        id: 'test-place',
        world: true,
        world_name: 'test-world',
        base_position: '0,0'
      }

      const mockAdmin: SceneAdmin = {
        id: '1',
        place_id: 'test-place',
        admin: '0xadmin1',
        added_by: '0xadder1',
        created_at: Date.now(),
        active: true
      }

      const mockWorldPermissions = {
        owner: '0xowner1',
        permissions: {
          deployment: {
            type: PermissionType.AllowList,
            wallets: ['0xdeployer1', '0xdeployer2']
          },
          streaming: {
            type: PermissionType.AllowList,
            wallets: ['0xstreamer1', '0xstreamer2']
          }
        }
      }

      mockedComponents.sceneAdminManager.listActiveAdmins.mockResolvedValue([mockAdmin])
      mockedComponents.worlds.fetchWorldActionPermissions.mockResolvedValue(mockWorldPermissions)

      const result = await sceneAdmins.getAdminsAndExtraAddresses(place)

      expect(mockedComponents.worlds.fetchWorldActionPermissions).toHaveBeenCalledWith('test-world')
      expect(mockedComponents.lands.getLandOperators).not.toHaveBeenCalled()

      expect(result.admins).toEqual(new Set([mockAdmin]))
      expect(result.extraAddresses).toEqual(
        new Set(
          ['0xowner1', '0xdeployer1', '0xdeployer2', '0xstreamer1', '0xstreamer2'].map((addr) => addr.toLowerCase())
        )
      )
      expect(result.addresses).toEqual(
        new Set(
          ['0xadmin1', '0xowner1', '0xdeployer1', '0xdeployer2', '0xstreamer1', '0xstreamer2'].map((addr) =>
            addr.toLowerCase()
          )
        )
      )
    })

    it('should include land owner and operator addresses when place a land in genesis city', async () => {
      const place = {
        id: 'test-place',
        world: false,
        world_name: undefined,
        base_position: '0,0'
      }

      const mockAdmin: SceneAdmin = {
        id: '1',
        place_id: 'test-place',
        admin: '0xadmin1',
        added_by: '0xadder1',
        created_at: Date.now(),
        active: true
      }

      const mockLandOperators = {
        owner: '0xlandowner1',
        operator: '0xoperator1',
        updateOperators: null,
        updateManagers: [],
        approvedForAll: []
      }

      mockedComponents.sceneAdminManager.listActiveAdmins.mockResolvedValue([mockAdmin])
      mockedComponents.lands.getLandOperators.mockResolvedValue(mockLandOperators)

      const result = await sceneAdmins.getAdminsAndExtraAddresses(place)

      expect(mockedComponents.worlds.fetchWorldActionPermissions).not.toHaveBeenCalled()
      expect(mockedComponents.lands.getLandOperators).toHaveBeenCalledWith('0,0')

      expect(result.admins).toEqual(new Set([mockAdmin]))
      expect(result.extraAddresses).toEqual(new Set(['0xlandowner1', '0xoperator1'].map((addr) => addr.toLowerCase())))
      expect(result.addresses).toEqual(
        new Set(['0xadmin1', '0xlandowner1', '0xoperator1'].map((addr) => addr.toLowerCase()))
      )
    })

    it('should filter admins by specific address when provided', async () => {
      const place = {
        id: 'test-place',
        world: false,
        world_name: undefined,
        base_position: '0,0'
      }

      const specificAdmin = '0xspecificadmin'

      const mockAdmin: SceneAdmin = {
        id: '1',
        place_id: 'test-place',
        admin: '0xadmin1',
        added_by: '0xadder1',
        created_at: Date.now(),
        active: true
      }

      const mockLandOperators = {
        owner: '0xlandowner1',
        operator: '0xoperator1',
        updateOperators: null,
        updateManagers: [],
        approvedForAll: []
      }

      mockedComponents.sceneAdminManager.listActiveAdmins.mockResolvedValue([mockAdmin])
      mockedComponents.lands.getLandOperators.mockResolvedValue(mockLandOperators)

      await sceneAdmins.getAdminsAndExtraAddresses(place, specificAdmin)

      expect(mockedComponents.sceneAdminManager.listActiveAdmins).toHaveBeenCalledWith({
        place_id: 'test-place',
        admin: specificAdmin
      })
    })

    it('should propagate errors from world permissions fetch', async () => {
      const place = {
        id: 'test-place',
        world: true,
        world_name: 'test-world',
        base_position: '0,0'
      }

      const error = new Error('Test error')
      mockedComponents.worlds.fetchWorldActionPermissions.mockRejectedValue(error)

      await expect(sceneAdmins.getAdminsAndExtraAddresses(place)).rejects.toThrow('Test error')
    })

    it('should propagate errors from land operators fetch', async () => {
      const place = {
        id: 'test-place',
        world: false,
        world_name: undefined,
        base_position: '0,0'
      }

      const error = new Error('Test error')
      mockedComponents.lands.getLandOperators.mockRejectedValue(error)

      await expect(sceneAdmins.getAdminsAndExtraAddresses(place)).rejects.toThrow('Test error')
    })
  })
})
