import { ILoggerComponent } from '@well-known-components/interfaces'
import { createSceneBansComponent, ISceneBansComponent } from '../../src/logic/scene-bans'
import { ISceneBanManager } from '../../src/types'
import { ILivekitComponent } from '../../src/types/livekit.type'
import { IPlacesComponent, PlaceAttributes } from '../../src/types/places.type'
import { ISceneManager, UserScenePermissions } from '../../src/types/scene-manager.type'
import { createLivekitMockedComponent } from '../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createSceneBanManagerMockedComponent } from '../mocks/scene-ban-manager-mock'
import { createMockedPlace, createMockedWorldPlace, createPlacesMockedComponent } from '../mocks/places-mock'
import { createSceneManagerMockedComponent } from '../mocks/scene-manager-mock'
import { IAnalyticsComponent } from '@dcl/analytics-component'
import { createAnalyticsMockedComponent } from '../mocks/analytics-mocks'
import { AnalyticsEvent } from '../../src/types/analytics'
import { INamesComponent } from '../../src/types/names.type'
import { createNamesMockedComponent } from '../mocks/names-mock'
import { IsUserBannedParams } from '../../src/logic/scene-bans/types'

describe('SceneBanComponent', () => {
  let sceneBanComponent: ISceneBansComponent
  let livekitMockedComponent: jest.Mocked<ILivekitComponent>
  let sceneManagerMockedComponent: jest.Mocked<ISceneManager>
  let sceneBanManagerMockedComponent: jest.Mocked<ISceneBanManager>
  let placesMockedComponent: jest.Mocked<IPlacesComponent>
  let logsMockedComponent: jest.Mocked<ILoggerComponent>
  let analyticsMockedComponent: jest.Mocked<IAnalyticsComponent>
  let namesMockedComponent: jest.Mocked<INamesComponent>

  let userScenePermissions: UserScenePermissions
  let mockPlace: PlaceAttributes
  let mockWorldPlace: PlaceAttributes

  beforeEach(async () => {
    livekitMockedComponent = createLivekitMockedComponent()
    sceneBanManagerMockedComponent = createSceneBanManagerMockedComponent()
    sceneManagerMockedComponent = createSceneManagerMockedComponent()
    placesMockedComponent = createPlacesMockedComponent()
    logsMockedComponent = createLoggerMockedComponent()
    analyticsMockedComponent = createAnalyticsMockedComponent()
    namesMockedComponent = createNamesMockedComponent()

    sceneBanComponent = createSceneBansComponent({
      sceneBanManager: sceneBanManagerMockedComponent,
      livekit: livekitMockedComponent,
      sceneManager: sceneManagerMockedComponent,
      places: placesMockedComponent,
      logs: logsMockedComponent,
      analytics: analyticsMockedComponent,
      names: namesMockedComponent
    })

    userScenePermissions = {
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    }

    mockPlace = createMockedPlace()
    mockWorldPlace = createMockedWorldPlace()

    placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)
    placesMockedComponent.getPlaceByWorldName.mockResolvedValue(mockWorldPlace)
  })

  describe('when adding a scene ban', () => {
    describe('when adding a ban for a regular scene', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        sceneBanManagerMockedComponent.addBan.mockResolvedValue(undefined)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1234567890123456789012345678901234567890'
        ])
        livekitMockedComponent.getRoomName.mockReturnValue('scene-test-realm:test-scene')
        livekitMockedComponent.removeParticipant.mockResolvedValue(undefined)
        livekitMockedComponent.updateRoomMetadata.mockResolvedValue(undefined)

        await sceneBanComponent.addSceneBan(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
          {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          }
        )
      })

      it('should add the ban to the database', async () => {
        expect(sceneBanManagerMockedComponent.addBan).toHaveBeenCalledWith({
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890',
          banned_by: '0x0987654321098765432109876543210987654321'
        })
      })

      it('should remove the participant from the livekit scene room', async () => {
        expect(livekitMockedComponent.getRoomName).toHaveBeenCalledWith('test-realm', {
          isWorld: false,
          sceneId: 'test-scene'
        })

        expect(livekitMockedComponent.removeParticipant).toHaveBeenCalledWith(
          'scene-test-realm:test-scene',
          '0x1234567890123456789012345678901234567890'
        )
      })

      it('should update room metadata with banned addresses', async () => {
        expect(livekitMockedComponent.updateRoomMetadata).toHaveBeenCalledWith('scene-test-realm:test-scene', {
          bannedAddresses: ['0x1234567890123456789012345678901234567890']
        })
      })

      it('should track the ban in analytics', async () => {
        expect(analyticsMockedComponent.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.SCENE_BAN_ADDED, {
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890',
          banned_by: '0x0987654321098765432109876543210987654321',
          banned_at: expect.any(Number),
          scene_id: 'test-scene',
          parcel: '-9,-9',
          realm_name: 'test-realm'
        })
      })
    })

    describe('when adding a ban for a world', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        sceneBanManagerMockedComponent.addBan.mockResolvedValue(undefined)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1234567890123456789012345678901234567890'
        ])
        livekitMockedComponent.getRoomName.mockReturnValue('world-test-world.dcl.eth')
        livekitMockedComponent.removeParticipant.mockResolvedValue(undefined)
        livekitMockedComponent.updateRoomMetadata.mockResolvedValue(undefined)

        await sceneBanComponent.addSceneBan(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
          {
            sceneId: undefined,
            realmName: 'test-world.dcl.eth',
            parcel: undefined,
            isWorld: true
          }
        )
      })

      it('should remove the participant from the livekit room', async () => {
        expect(livekitMockedComponent.getRoomName).toHaveBeenCalledWith('test-world.dcl.eth', { isWorld: true })

        expect(livekitMockedComponent.removeParticipant).toHaveBeenCalledWith(
          'world-test-world.dcl.eth',
          '0x1234567890123456789012345678901234567890'
        )
      })

      it('should update room metadata with banned addresses', async () => {
        expect(livekitMockedComponent.updateRoomMetadata).toHaveBeenCalledWith('world-test-world.dcl.eth', {
          bannedAddresses: ['0x1234567890123456789012345678901234567890']
        })
      })

      it('should track the ban in analytics', async () => {
        expect(analyticsMockedComponent.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.SCENE_BAN_ADDED, {
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890',
          banned_by: '0x0987654321098765432109876543210987654321',
          banned_at: expect.any(Number),
          realm_name: 'test-world.dcl.eth',
          scene_id: undefined,
          parcel: undefined
        })
      })
    })

    describe('when LiveKit removal fails', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        livekitMockedComponent.getRoomName.mockReturnValue('scene-test-realm:test-scene')
        livekitMockedComponent.removeParticipant.mockRejectedValue(new Error('LiveKit connection failed'))
      })

      it('should ignore the LiveKit error and ban the user in the database', async () => {
        await expect(
          sceneBanComponent.addSceneBan(
            '0x1234567890123456789012345678901234567890',
            '0x0987654321098765432109876543210987654321',
            {
              sceneId: 'test-scene',
              realmName: 'test-realm',
              parcel: '-9,-9',
              isWorld: false
            }
          )
        ).resolves.not.toThrow()

        expect(sceneBanManagerMockedComponent.addBan).toHaveBeenCalledWith({
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890',
          banned_by: '0x0987654321098765432109876543210987654321'
        })
      })
    })

    describe('when adding the ban to the database fails', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        livekitMockedComponent.removeParticipant.mockResolvedValue(undefined)
        sceneBanManagerMockedComponent.addBan.mockRejectedValue(new Error('Database error'))
      })

      it('should propagate the error', async () => {
        await expect(
          sceneBanComponent.addSceneBan(
            '0x1234567890123456789012345678901234567890',
            '0x0987654321098765432109876543210987654321',
            {
              sceneId: 'test-scene',
              realmName: 'test-realm',
              parcel: '-9,-9',
              isWorld: false
            }
          )
        ).rejects.toThrow('Database error')
      })
    })

    describe('when user lacks permission to ban', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw UnauthorizedError', async () => {
        await expect(
          sceneBanComponent.addSceneBan(
            '0x1234567890123456789012345678901234567890',
            '0x0987654321098765432109876543210987654321',
            {
              sceneId: 'test-scene',
              realmName: 'test-realm',
              parcel: '-9,-9',
              isWorld: false
            }
          )
        ).rejects.toThrow('You do not have permission to ban users from this place')
      })
    })

    describe('when trying to ban a protected user', () => {
      describe('and user is owner', () => {
        beforeEach(() => {
          userScenePermissions.owner = true
          sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
          sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        })

        it('should throw InvalidRequestError', async () => {
          await expect(
            sceneBanComponent.addSceneBan(
              '0x1234567890123456789012345678901234567890',
              '0x0987654321098765432109876543210987654321',
              {
                sceneId: 'test-scene',
                realmName: 'test-realm',
                parcel: '-9,-9',
                isWorld: false
              }
            )
          ).rejects.toThrow('Cannot ban this address')
        })
      })

      describe('and user is admin', () => {
        beforeEach(() => {
          userScenePermissions.admin = true
          sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
          sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        })

        it('should throw InvalidRequestError', async () => {
          await expect(
            sceneBanComponent.addSceneBan(
              '0x1234567890123456789012345678901234567890',
              '0x0987654321098765432109876543210987654321',
              {
                sceneId: 'test-scene',
                realmName: 'test-realm',
                parcel: '-9,-9',
                isWorld: false
              }
            )
          ).rejects.toThrow('Cannot ban this address')
        })
      })

      describe('and user has extended permissions', () => {
        beforeEach(() => {
          userScenePermissions.hasExtendedPermissions = true
          sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
          sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        })

        it('should throw InvalidRequestError', async () => {
          await expect(
            sceneBanComponent.addSceneBan(
              '0x1234567890123456789012345678901234567890',
              '0x0987654321098765432109876543210987654321',
              {
                sceneId: 'test-scene',
                realmName: 'test-realm',
                parcel: '-9,-9',
                isWorld: false
              }
            )
          ).rejects.toThrow('Cannot ban this address')
        })
      })
    })
  })

  describe('when removing a scene ban', () => {
    describe('when removing a ban for a regular scene', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.removeBan.mockResolvedValue(undefined)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([])
        livekitMockedComponent.getRoomName.mockReturnValue('scene-test-realm:test-scene')
        livekitMockedComponent.updateRoomMetadata.mockResolvedValue(undefined)

        await sceneBanComponent.removeSceneBan(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
          {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          }
        )
      })

      it('should remove the ban from the database', async () => {
        expect(sceneBanManagerMockedComponent.removeBan).toHaveBeenCalledWith(
          'test-place-id',
          '0x1234567890123456789012345678901234567890'
        )
      })

      it('should update room metadata with updated banned addresses', async () => {
        expect(livekitMockedComponent.updateRoomMetadata).toHaveBeenCalledWith('scene-test-realm:test-scene', {
          bannedAddresses: []
        })
      })

      it('should track the unban in analytics', async () => {
        expect(analyticsMockedComponent.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.SCENE_BAN_REMOVED, {
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890',
          unbanned_by: '0x0987654321098765432109876543210987654321',
          unbanned_at: expect.any(Number),
          scene_id: 'test-scene',
          parcel: '-9,-9',
          realm_name: 'test-realm'
        })
      })
    })

    describe('when removing a ban for a world', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.removeBan.mockResolvedValue(undefined)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([])
        livekitMockedComponent.getRoomName.mockReturnValue('world-test-world.dcl.eth')
        livekitMockedComponent.updateRoomMetadata.mockResolvedValue(undefined)

        await sceneBanComponent.removeSceneBan(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
          {
            sceneId: undefined,
            realmName: 'test-world.dcl.eth',
            parcel: undefined,
            isWorld: true
          }
        )
      })

      it('should remove the ban from the database', async () => {
        expect(sceneBanManagerMockedComponent.removeBan).toHaveBeenCalledWith(
          'test-place-id',
          '0x1234567890123456789012345678901234567890'
        )
      })

      it('should update room metadata with updated banned addresses', async () => {
        expect(livekitMockedComponent.updateRoomMetadata).toHaveBeenCalledWith('world-test-world.dcl.eth', {
          bannedAddresses: []
        })
      })

      it('should track the unban in analytics', async () => {
        expect(analyticsMockedComponent.fireEvent).toHaveBeenCalledWith(AnalyticsEvent.SCENE_BAN_REMOVED, {
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890',
          unbanned_by: '0x0987654321098765432109876543210987654321',
          unbanned_at: expect.any(Number),
          realm_name: 'test-world.dcl.eth',
          scene_id: undefined,
          parcel: undefined
        })
      })
    })

    describe('when removing the ban from the database fails', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.removeBan.mockRejectedValue(new Error('Database error'))
      })

      it('should propagate the error', async () => {
        await expect(
          sceneBanComponent.removeSceneBan(
            '0x1234567890123456789012345678901234567890',
            '0x0987654321098765432109876543210987654321',
            {
              sceneId: 'test-scene',
              realmName: 'test-realm',
              parcel: '-9,-9',
              isWorld: false
            }
          )
        ).rejects.toThrow('Database error')
      })
    })

    describe('when user lacks permission to unban', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw UnauthorizedError', async () => {
        await expect(
          sceneBanComponent.removeSceneBan(
            '0x1234567890123456789012345678901234567890',
            '0x0987654321098765432109876543210987654321',
            {
              sceneId: 'test-scene',
              realmName: 'test-realm',
              parcel: '-9,-9',
              isWorld: false
            }
          )
        ).rejects.toThrow('You do not have permission to unban users from this place')
      })
    })

    describe('when room metadata update fails', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        sceneBanManagerMockedComponent.addBan.mockResolvedValue(undefined)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1234567890123456789012345678901234567890'
        ])
        livekitMockedComponent.getRoomName.mockReturnValue('scene-test-realm:test-scene')
        livekitMockedComponent.removeParticipant.mockResolvedValue(undefined)
        livekitMockedComponent.updateRoomMetadata.mockRejectedValue(new Error('Room metadata update failed'))
      })

      it('should not throw to avoid breaking flow', async () => {
        await expect(
          sceneBanComponent.addSceneBan(
            '0x1234567890123456789012345678901234567890',
            '0x0987654321098765432109876543210987654321',
            {
              sceneId: 'test-scene',
              realmName: 'test-realm',
              parcel: '-9,-9',
              isWorld: false
            }
          )
        ).resolves.not.toThrow()

        expect(sceneBanManagerMockedComponent.addBan).toHaveBeenCalledWith({
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890',
          banned_by: '0x0987654321098765432109876543210987654321'
        })
        expect(livekitMockedComponent.removeParticipant).toHaveBeenCalledWith(
          'scene-test-realm:test-scene',
          '0x1234567890123456789012345678901234567890'
        )
      })
    })
  })

  describe('when listing scene bans', () => {
    describe('when listing bans for a regular scene', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222'
        ])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(2)
        namesMockedComponent.getNamesFromAddresses.mockResolvedValue({
          '0x1111111111111111111111111111111111111111': 'User One',
          '0x2222222222222222222222222222222222222222': 'User Two'
        })
      })

      it('should call the scene manager to check permissions', async () => {
        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(sceneManagerMockedComponent.isSceneOwnerOrAdmin).toHaveBeenCalledWith(
          mockPlace,
          '0x0987654321098765432109876543210987654321'
        )
      })

      it('should call the scene ban manager to list bans with pagination', async () => {
        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id', 20, 0)
      })

      it('should return the list of bans with total count', async () => {
        const result = await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          bans: [
            {
              bannedAddress: '0x1111111111111111111111111111111111111111',
              name: 'User One'
            },
            {
              bannedAddress: '0x2222222222222222222222222222222222222222',
              name: 'User Two'
            }
          ],
          total: 2
        })
      })
    })

    describe('when listing bans for a world', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1111111111111111111111111111111111111111'
        ])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(1)
        namesMockedComponent.getNamesFromAddresses.mockResolvedValue({
          '0x1111111111111111111111111111111111111111': 'User One'
        })
      })

      it('should call the places component to get world place', async () => {
        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(placesMockedComponent.getPlaceByWorldName).toHaveBeenCalledWith('test-world.dcl.eth')
      })

      it('should call the scene ban manager to list bans with pagination', async () => {
        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id', 20, 0)
      })

      it('should return the list of bans with total count', async () => {
        const result = await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          bans: [
            {
              bannedAddress: '0x1111111111111111111111111111111111111111',
              name: 'User One'
            }
          ],
          total: 1
        })
      })
    })

    describe('when listing bans with no results', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(0)
        namesMockedComponent.getNamesFromAddresses.mockResolvedValue({})
      })

      it('should return an empty result with total count', async () => {
        const result = await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          bans: [],
          total: 0
        })
      })
    })

    describe('when user lacks permission to list bans', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw UnauthorizedError', async () => {
        await expect(
          sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          })
        ).rejects.toThrow('User does not have permission to list scene bans')
      })
    })

    describe('when listing bans from the database fails', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockRejectedValue(new Error('Database error'))
      })

      it('should propagate the error', async () => {
        await expect(
          sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          })
        ).rejects.toThrow('Database error')
      })
    })
  })

  describe('when listing scene banned addresses', () => {
    describe('when listing banned addresses for a regular scene', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222'
        ])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(2)
      })

      it('should call the scene manager to check permissions', async () => {
        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(sceneManagerMockedComponent.isSceneOwnerOrAdmin).toHaveBeenCalledWith(
          mockPlace,
          '0x0987654321098765432109876543210987654321'
        )
      })

      it('should call the scene ban manager to list banned addresses with pagination', async () => {
        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id', 20, 0)
      })

      it('should return the list of banned addresses with total count', async () => {
        const result = await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          addresses: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
          total: 2
        })
      })
    })

    describe('when listing banned addresses for a world', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1111111111111111111111111111111111111111'
        ])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(1)
      })

      it('should call the places component to get world place', async () => {
        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(placesMockedComponent.getPlaceByWorldName).toHaveBeenCalledWith('test-world.dcl.eth')
      })

      it('should call the scene ban manager to list banned addresses with pagination', async () => {
        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id', 20, 0)
      })

      it('should return the list of banned addresses with total count', async () => {
        const result = await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          addresses: ['0x1111111111111111111111111111111111111111'],
          total: 1
        })
      })
    })

    describe('when listing banned addresses with no results', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(0)
      })

      it('should return an empty result with total count', async () => {
        const result = await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          addresses: [],
          total: 0
        })
      })
    })

    describe('when user lacks permission to list banned addresses', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw UnauthorizedError', async () => {
        await expect(
          sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          })
        ).rejects.toThrow('User does not have permission to list scene bans')
      })
    })

    describe('when listing banned addresses from the database fails', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockRejectedValue(new Error('Database error'))
      })

      it('should propagate the error', async () => {
        await expect(
          sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          })
        ).rejects.toThrow('Database error')
      })
    })
  })

  describe('when listing scene bans', () => {
    describe('when listing bans for a regular scene', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222'
        ])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(2)
        namesMockedComponent.getNamesFromAddresses.mockResolvedValue({
          '0x1111111111111111111111111111111111111111': 'User One',
          '0x2222222222222222222222222222222222222222': 'User Two'
        })
      })

      it('should call the scene manager to check permissions', async () => {
        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(sceneManagerMockedComponent.isSceneOwnerOrAdmin).toHaveBeenCalledWith(
          mockPlace,
          '0x0987654321098765432109876543210987654321'
        )
      })

      it('should call the scene ban manager to list bans with pagination', async () => {
        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id', 20, 0)
      })

      it('should return the list of bans with total count', async () => {
        const result = await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          bans: [
            {
              bannedAddress: '0x1111111111111111111111111111111111111111',
              name: 'User One'
            },
            {
              bannedAddress: '0x2222222222222222222222222222222222222222',
              name: 'User Two'
            }
          ],
          total: 2
        })
      })
    })

    describe('when listing bans for a world', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1111111111111111111111111111111111111111'
        ])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(1)
        namesMockedComponent.getNamesFromAddresses.mockResolvedValue({
          '0x1111111111111111111111111111111111111111': 'User One'
        })
      })

      it('should call the places component to get world place', async () => {
        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(placesMockedComponent.getPlaceByWorldName).toHaveBeenCalledWith('test-world.dcl.eth')
      })

      it('should call the scene ban manager to list bans with pagination', async () => {
        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id', 20, 0)
      })

      it('should return the list of bans with total count', async () => {
        const result = await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          bans: [
            {
              bannedAddress: '0x1111111111111111111111111111111111111111',
              name: 'User One'
            }
          ],
          total: 1
        })
      })
    })

    describe('when listing bans with no results', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(0)
        namesMockedComponent.getNamesFromAddresses.mockResolvedValue({})
      })

      it('should return an empty result with total count', async () => {
        const result = await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          bans: [],
          total: 0
        })
      })
    })

    describe('when user lacks permission to list bans', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw UnauthorizedError', async () => {
        await expect(
          sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          })
        ).rejects.toThrow('User does not have permission to list scene bans')
      })
    })

    describe('when listing bans from the database fails', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockRejectedValue(new Error('Database error'))
      })

      it('should propagate the error', async () => {
        await expect(
          sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          })
        ).rejects.toThrow('Database error')
      })
    })
  })

  describe('when listing scene banned addresses', () => {
    describe('when listing banned addresses for a regular scene', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222'
        ])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(2)
      })

      it('should call the scene manager to check permissions', async () => {
        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(sceneManagerMockedComponent.isSceneOwnerOrAdmin).toHaveBeenCalledWith(
          mockPlace,
          '0x0987654321098765432109876543210987654321'
        )
      })

      it('should call the scene ban manager to list banned addresses with pagination', async () => {
        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id', 20, 0)
      })

      it('should return the list of banned addresses with total count', async () => {
        const result = await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          addresses: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
          total: 2
        })
      })
    })

    describe('when listing banned addresses for a world', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1111111111111111111111111111111111111111'
        ])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(1)
      })

      it('should call the places component to get world place', async () => {
        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(placesMockedComponent.getPlaceByWorldName).toHaveBeenCalledWith('test-world.dcl.eth')
      })

      it('should call the scene ban manager to list banned addresses with pagination', async () => {
        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id', 20, 0)
      })

      it('should return the list of banned addresses with total count', async () => {
        const result = await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          addresses: ['0x1111111111111111111111111111111111111111'],
          total: 1
        })
      })
    })

    describe('when listing banned addresses with no results', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([])
        sceneBanManagerMockedComponent.countBannedAddresses.mockResolvedValue(0)
      })

      it('should return an empty result with total count', async () => {
        const result = await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false,
          page: 1,
          limit: 20
        })

        expect(result).toEqual({
          addresses: [],
          total: 0
        })
      })
    })

    describe('when user lacks permission to list banned addresses', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw UnauthorizedError', async () => {
        await expect(
          sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          })
        ).rejects.toThrow('User does not have permission to list scene bans')
      })
    })

    describe('when listing banned addresses from the database fails', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockRejectedValue(new Error('Database error'))
      })

      it('should propagate the error', async () => {
        await expect(
          sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorld: false
          })
        ).rejects.toThrow('Database error')
      })
    })
  })

  describe('when checking if a user is banned', () => {
    const testAddress = '0x1234567890123456789012345678901234567890'
    let params: IsUserBannedParams

    describe('for a regular scene', () => {
      beforeEach(() => {
        params = {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorld: false
        }
        sceneBanManagerMockedComponent.isBanned.mockResolvedValue(true)
      })

      describe('and the place lookup fails', () => {
        beforeEach(() => {
          placesMockedComponent.getPlaceByParcel.mockRejectedValue(new Error('Place not found'))
        })

        it('should propagate the error', async () => {
          await expect(sceneBanComponent.isUserBanned(testAddress, params)).rejects.toThrow('Place not found')
        })
      })

      describe('and the place lookup succeeds', () => {
        beforeEach(() => {
          placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)
        })

        describe('and the user is banned', () => {
          beforeEach(() => {
            sceneBanManagerMockedComponent.isBanned.mockResolvedValue(true)
          })

          it('should get place by parcel, check ban status, and return true', async () => {
            const result = await sceneBanComponent.isUserBanned(testAddress, params)

            expect(placesMockedComponent.getPlaceByParcel).toHaveBeenCalledWith('-9,-9')
            expect(sceneBanManagerMockedComponent.isBanned).toHaveBeenCalledWith('test-place-id', testAddress)
            expect(result).toBe(true)
          })
        })

        describe('and the user is not banned', () => {
          beforeEach(() => {
            sceneBanManagerMockedComponent.isBanned.mockResolvedValue(false)
          })

          it('should return false', async () => {
            const result = await sceneBanComponent.isUserBanned(testAddress, params)

            expect(result).toBe(false)
          })
        })
      })
    })

    describe('for a world', () => {
      beforeEach(() => {
        params = {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true
        }
        sceneBanManagerMockedComponent.isBanned.mockResolvedValue(true)
      })

      describe('and the world place lookup fails', () => {
        beforeEach(() => {
          placesMockedComponent.getPlaceByWorldName.mockRejectedValue(new Error('World not found'))
        })

        it('should propagate the error', async () => {
          await expect(sceneBanComponent.isUserBanned(testAddress, params)).rejects.toThrow('World not found')
        })
      })

      describe('and the world place lookup succeeds', () => {
        beforeEach(() => {
          placesMockedComponent.getPlaceByWorldName.mockResolvedValue(mockWorldPlace)
        })

        describe('and the user is banned', () => {
          beforeEach(() => {
            sceneBanManagerMockedComponent.isBanned.mockResolvedValue(true)
          })

          it('should get place by world name, check ban status, and return true', async () => {
            const result = await sceneBanComponent.isUserBanned(testAddress, params)

            expect(placesMockedComponent.getPlaceByWorldName).toHaveBeenCalledWith('test-world.dcl.eth')
            expect(sceneBanManagerMockedComponent.isBanned).toHaveBeenCalledWith('test-place-id', testAddress)
            expect(result).toBe(true)
          })
        })

        describe('and the user is not banned', () => {
          beforeEach(() => {
            sceneBanManagerMockedComponent.isBanned.mockResolvedValue(false)
          })

          it('should return false', async () => {
            const result = await sceneBanComponent.isUserBanned(testAddress, params)
            expect(result).toBe(false)
          })
        })
      })
    })

    describe('and the database check fails', () => {
      beforeEach(() => {
        params = {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorld: true
        }
        placesMockedComponent.getPlaceByWorldName.mockResolvedValue(mockWorldPlace)
        sceneBanManagerMockedComponent.isBanned.mockRejectedValue(new Error('Database error'))
      })

      it('should propagate the error', async () => {
        await expect(sceneBanComponent.isUserBanned(testAddress, params)).rejects.toThrow('Database error')
      })
    })
  })
})
