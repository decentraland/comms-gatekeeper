import { createSceneAdminsComponent } from '../../src/adapters/scene-admins'
import { SceneAdmin } from '../../src/types'
import { PermissionType } from '../../src/types/worlds.type'

describe('SceneAdmins', () => {
  let mockedComponents: any
  let sceneAdmins: any

  beforeEach(async () => {
    mockedComponents = {
      worlds: {
        fetchWorldActionPermissions: jest.fn(),
        getWorldParcelPermissionAddresses: jest.fn()
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
    describe('when the place is a world', () => {
      const place = {
        id: 'test-place',
        world: true,
        world_name: 'test-world',
        base_position: '0,0',
        positions: ['0,0', '0,1']
      }

      let mockAdmin: SceneAdmin

      beforeEach(() => {
        mockAdmin = {
          id: '1',
          place_id: 'test-place',
          admin: '0xadmin1',
          added_by: '0xadder1',
          created_at: Date.now(),
          active: true
        }

        mockedComponents.sceneAdminManager.listActiveAdmins.mockResolvedValueOnce([mockAdmin])
        mockedComponents.worlds.fetchWorldActionPermissions.mockResolvedValue({
          owner: '0xowner1',
          permissions: {
            deployment: { type: PermissionType.AllowList, wallets: ['0xdeployer1', '0xdeployer2'] },
            streaming: { type: PermissionType.AllowList, wallets: ['0xstreamer1', '0xstreamer2'] }
          }
        })
      })

      describe('when the bulk parcel permissions endpoint succeeds', () => {
        let result: any

        beforeEach(async () => {
          mockedComponents.worlds.getWorldParcelPermissionAddresses
            .mockResolvedValueOnce(['0xdeployer1'])
            .mockResolvedValueOnce(['0xstreamer1', '0xstreamer2'])

          result = await sceneAdmins.getAdminsAndExtraAddresses(place)
        })

        it('should call the bulk endpoint for deployment permissions with the scene parcels', () => {
          expect(mockedComponents.worlds.getWorldParcelPermissionAddresses).toHaveBeenCalledWith(
            'test-world',
            'deployment',
            ['0,0', '0,1']
          )
        })

        it('should call the bulk endpoint for streaming permissions with the scene parcels', () => {
          expect(mockedComponents.worlds.getWorldParcelPermissionAddresses).toHaveBeenCalledWith(
            'test-world',
            'streaming',
            ['0,0', '0,1']
          )
        })

        it('should include addresses returned by the bulk endpoint in extraAddresses', () => {
          expect(result.extraAddresses).toEqual(
            new Set(['0xdeployer1', '0xstreamer1', '0xstreamer2', '0xowner1'].map((a) => a.toLowerCase()))
          )
        })

        it('should include the world owner in extraAddresses', () => {
          expect(result.extraAddresses.has('0xowner1')).toBe(true)
        })

        it('should include both admins and extra addresses in the combined addresses set', () => {
          expect(result.addresses).toEqual(
            new Set(['0xadmin1', '0xdeployer1', '0xstreamer1', '0xstreamer2', '0xowner1'].map((a) => a.toLowerCase()))
          )
        })

        it('should not call getLandOperators', () => {
          expect(mockedComponents.lands.getLandOperators).not.toHaveBeenCalled()
        })
      })

      describe('when the bulk parcel permissions endpoint fails', () => {
        let result: any

        beforeEach(async () => {
          mockedComponents.worlds.getWorldParcelPermissionAddresses.mockRejectedValue(
            new Error('Endpoint not available')
          )

          result = await sceneAdmins.getAdminsAndExtraAddresses(place)
        })

        it('should fall back to fetching world action permissions', () => {
          expect(mockedComponents.worlds.fetchWorldActionPermissions).toHaveBeenCalledWith('test-world')
        })

        it('should include all allow-listed deployment wallets in extraAddresses', () => {
          expect(result.extraAddresses.has('0xdeployer1')).toBe(true)
          expect(result.extraAddresses.has('0xdeployer2')).toBe(true)
        })

        it('should include all allow-listed streaming wallets in extraAddresses', () => {
          expect(result.extraAddresses.has('0xstreamer1')).toBe(true)
          expect(result.extraAddresses.has('0xstreamer2')).toBe(true)
        })

        it('should include the world owner in extraAddresses', () => {
          expect(result.extraAddresses.has('0xowner1')).toBe(true)
        })

        it('should include all addresses in the combined addresses set', () => {
          expect(result.addresses).toEqual(
            new Set(
              ['0xadmin1', '0xowner1', '0xdeployer1', '0xdeployer2', '0xstreamer1', '0xstreamer2'].map((a) =>
                a.toLowerCase()
              )
            )
          )
        })
      })
    })

    describe('when the place is a land in genesis city', () => {
      const place = {
        id: 'test-place',
        world: false,
        world_name: undefined,
        base_position: '0,0',
        positions: ['0,0']
      }

      let result: any

      beforeEach(async () => {
        const mockAdmin: SceneAdmin = {
          id: '1',
          place_id: 'test-place',
          admin: '0xadmin1',
          added_by: '0xadder1',
          created_at: Date.now(),
          active: true
        }

        mockedComponents.sceneAdminManager.listActiveAdmins.mockResolvedValueOnce([mockAdmin])
        mockedComponents.lands.getLandOperators.mockResolvedValueOnce({
          owner: '0xlandowner1',
          operator: '0xoperator1',
          updateOperator: '0xupdateoperator1',
          updateManagers: [],
          approvedForAll: []
        })

        result = await sceneAdmins.getAdminsAndExtraAddresses(place)
      })

      it('should not call fetchWorldActionPermissions', () => {
        expect(mockedComponents.worlds.fetchWorldActionPermissions).not.toHaveBeenCalled()
      })

      it('should call getLandOperators with the base position', () => {
        expect(mockedComponents.lands.getLandOperators).toHaveBeenCalledWith('0,0')
      })

      it('should include land owner and operator addresses in extraAddresses', () => {
        expect(result.extraAddresses).toEqual(
          new Set(['0xlandowner1', '0xoperator1', '0xupdateoperator1'].map((a) => a.toLowerCase()))
        )
      })

      it('should include all addresses in the combined addresses set', () => {
        expect(result.addresses).toEqual(
          new Set(['0xadmin1', '0xlandowner1', '0xoperator1', '0xupdateoperator1'].map((a) => a.toLowerCase()))
        )
      })
    })

    describe('when filtering admins by specific address', () => {
      const place = {
        id: 'test-place',
        world: false,
        world_name: undefined,
        base_position: '0,0',
        positions: ['0,0']
      }
      const specificAdmin = '0xspecificadmin'

      beforeEach(async () => {
        mockedComponents.sceneAdminManager.listActiveAdmins.mockResolvedValueOnce([])
        mockedComponents.lands.getLandOperators.mockResolvedValueOnce({
          owner: '0xlandowner1',
          operator: null,
          updateOperator: null,
          updateManagers: [],
          approvedForAll: []
        })

        await sceneAdmins.getAdminsAndExtraAddresses(place, specificAdmin)
      })

      it('should pass the admin filter to listActiveAdmins', () => {
        expect(mockedComponents.sceneAdminManager.listActiveAdmins).toHaveBeenCalledWith({
          place_id: 'test-place',
          admin: specificAdmin
        })
      })
    })

    describe('when an error occurs', () => {
      describe('when fetchWorldActionPermissions fails after bulk endpoint fails', () => {
        const place = {
          id: 'test-place',
          world: true,
          world_name: 'test-world',
          base_position: '0,0',
          positions: ['0,0']
        }

        beforeEach(() => {
          mockedComponents.sceneAdminManager.listActiveAdmins.mockResolvedValueOnce([])
          mockedComponents.worlds.getWorldParcelPermissionAddresses.mockRejectedValue(
            new Error('Bulk endpoint not available')
          )
          mockedComponents.worlds.fetchWorldActionPermissions.mockRejectedValue(new Error('Permissions fetch error'))
        })

        it('should propagate the error from fetchWorldActionPermissions', async () => {
          await expect(sceneAdmins.getAdminsAndExtraAddresses(place)).rejects.toThrow('Permissions fetch error')
        })
      })

      describe('when getLandOperators fails', () => {
        const place = {
          id: 'test-place',
          world: false,
          world_name: undefined,
          base_position: '0,0',
          positions: ['0,0']
        }

        beforeEach(() => {
          mockedComponents.sceneAdminManager.listActiveAdmins.mockResolvedValueOnce([])
          mockedComponents.lands.getLandOperators.mockRejectedValue(new Error('Land operators error'))
        })

        it('should propagate the error from getLandOperators', async () => {
          await expect(sceneAdmins.getAdminsAndExtraAddresses(place)).rejects.toThrow('Land operators error')
        })
      })
    })
  })
})
