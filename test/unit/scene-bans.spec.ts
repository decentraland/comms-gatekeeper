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

describe('SceneBanComponent', () => {
  let sceneBanComponent: ISceneBansComponent
  let livekitMockedComponent: jest.Mocked<ILivekitComponent>
  let sceneManagerMockedComponent: jest.Mocked<ISceneManager>
  let sceneBanManagerMockedComponent: jest.Mocked<ISceneBanManager>
  let placesMockedComponent: jest.Mocked<IPlacesComponent>
  let logsMockedComponent: jest.Mocked<ILoggerComponent>
  let analyticsMockedComponent: jest.Mocked<IAnalyticsComponent>

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

    sceneBanComponent = createSceneBansComponent({
      sceneBanManager: sceneBanManagerMockedComponent,
      livekit: livekitMockedComponent,
      sceneManager: sceneManagerMockedComponent,
      places: placesMockedComponent,
      logs: logsMockedComponent,
      analytics: analyticsMockedComponent
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
        livekitMockedComponent.getRoomName.mockReturnValue('scene-test-realm:test-scene')
        livekitMockedComponent.removeParticipant.mockResolvedValue(undefined)

        await sceneBanComponent.addSceneBan(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
          {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorlds: false
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
          isWorlds: false,
          sceneId: 'test-scene'
        })

        expect(livekitMockedComponent.removeParticipant).toHaveBeenCalledWith(
          'scene-test-realm:test-scene',
          '0x1234567890123456789012345678901234567890'
        )
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
        livekitMockedComponent.getRoomName.mockReturnValue('world-test-world.dcl.eth')
        livekitMockedComponent.removeParticipant.mockResolvedValue(undefined)

        await sceneBanComponent.addSceneBan(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
          {
            sceneId: undefined,
            realmName: 'test-world.dcl.eth',
            parcel: undefined,
            isWorlds: true
          }
        )
      })

      it('should remove the participant from the livekit room', async () => {
        expect(livekitMockedComponent.getRoomName).toHaveBeenCalledWith('test-world.dcl.eth', { isWorlds: true })

        expect(livekitMockedComponent.removeParticipant).toHaveBeenCalledWith(
          'world-test-world.dcl.eth',
          '0x1234567890123456789012345678901234567890'
        )
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
              isWorlds: false
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
              isWorlds: false
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
              isWorlds: false
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
                isWorlds: false
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
                isWorlds: false
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
                isWorlds: false
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

        await sceneBanComponent.removeSceneBan(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
          {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorlds: false
          }
        )
      })

      it('should remove the ban from the database', async () => {
        expect(sceneBanManagerMockedComponent.removeBan).toHaveBeenCalledWith(
          'test-place-id',
          '0x1234567890123456789012345678901234567890'
        )
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

        await sceneBanComponent.removeSceneBan(
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321',
          {
            sceneId: undefined,
            realmName: 'test-world.dcl.eth',
            parcel: undefined,
            isWorlds: true
          }
        )
      })

      it('should remove the ban from the database', async () => {
        expect(sceneBanManagerMockedComponent.removeBan).toHaveBeenCalledWith(
          'test-place-id',
          '0x1234567890123456789012345678901234567890'
        )
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
              isWorlds: false
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
              isWorlds: false
            }
          )
        ).rejects.toThrow('You do not have permission to unban users from this place')
      })
    })
  })

  describe('when listing scene bans', () => {
    describe('when listing bans for a regular scene', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBans.mockResolvedValue([
          {
            id: 'ban-1',
            place_id: 'test-place-id',
            banned_address: '0x1111111111111111111111111111111111111111',
            banned_by: '0x0987654321098765432109876543210987654321',
            banned_at: 1234567890
          },
          {
            id: 'ban-2',
            place_id: 'test-place-id',
            banned_address: '0x2222222222222222222222222222222222222222',
            banned_by: '0x0987654321098765432109876543210987654321',
            banned_at: 1234567891
          }
        ])

        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorlds: false
        })
      })

      it('should call the scene manager to check permissions', async () => {
        expect(sceneManagerMockedComponent.isSceneOwnerOrAdmin).toHaveBeenCalledWith(
          mockPlace,
          '0x0987654321098765432109876543210987654321'
        )
      })

      it('should call the scene ban manager to list bans', async () => {
        expect(sceneBanManagerMockedComponent.listBans).toHaveBeenCalledWith('test-place-id')
      })

      it('should return the list of bans', async () => {
        const result = await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorlds: false
        })

        expect(result).toEqual([
          {
            id: 'ban-1',
            place_id: 'test-place-id',
            banned_address: '0x1111111111111111111111111111111111111111',
            banned_by: '0x0987654321098765432109876543210987654321',
            banned_at: 1234567890
          },
          {
            id: 'ban-2',
            place_id: 'test-place-id',
            banned_address: '0x2222222222222222222222222222222222222222',
            banned_by: '0x0987654321098765432109876543210987654321',
            banned_at: 1234567891
          }
        ])
      })
    })

    describe('when listing bans for a world', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBans.mockResolvedValue([
          {
            id: 'ban-1',
            place_id: 'test-place-id',
            banned_address: '0x1111111111111111111111111111111111111111',
            banned_by: '0x0987654321098765432109876543210987654321',
            banned_at: 1234567890
          }
        ])

        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorlds: true
        })
      })

      it('should call the places component to get world place', async () => {
        expect(placesMockedComponent.getPlaceByWorldName).toHaveBeenCalledWith('test-world.dcl.eth')
      })

      it('should call the scene ban manager to list bans', async () => {
        expect(sceneBanManagerMockedComponent.listBans).toHaveBeenCalledWith('test-place-id')
      })

      it('should return the list of bans', async () => {
        const result = await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorlds: true
        })

        expect(result).toEqual([
          {
            id: 'ban-1',
            place_id: 'test-place-id',
            banned_address: '0x1111111111111111111111111111111111111111',
            banned_by: '0x0987654321098765432109876543210987654321',
            banned_at: 1234567890
          }
        ])
      })
    })

    describe('when listing bans with no results', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBans.mockResolvedValue([])

        await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorlds: false
        })
      })

      it('should return an empty array', async () => {
        const result = await sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorlds: false
        })

        expect(result).toEqual([])
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
            isWorlds: false
          })
        ).rejects.toThrow('You do not have permission to list bans for this place')
      })
    })

    describe('when listing bans from the database fails', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBans.mockRejectedValue(new Error('Database error'))
      })

      it('should propagate the error', async () => {
        await expect(
          sceneBanComponent.listSceneBans('0x0987654321098765432109876543210987654321', {
            sceneId: 'test-scene',
            realmName: 'test-realm',
            parcel: '-9,-9',
            isWorlds: false
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

        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorlds: false
        })
      })

      it('should call the scene manager to check permissions', async () => {
        expect(sceneManagerMockedComponent.isSceneOwnerOrAdmin).toHaveBeenCalledWith(
          mockPlace,
          '0x0987654321098765432109876543210987654321'
        )
      })

      it('should call the scene ban manager to list banned addresses', async () => {
        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id')
      })

      it('should return the list of banned addresses', async () => {
        const result = await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorlds: false
        })

        expect(result).toEqual([
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222'
        ])
      })
    })

    describe('when listing banned addresses for a world', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([
          '0x1111111111111111111111111111111111111111'
        ])

        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorlds: true
        })
      })

      it('should call the places component to get world place', async () => {
        expect(placesMockedComponent.getPlaceByWorldName).toHaveBeenCalledWith('test-world.dcl.eth')
      })

      it('should call the scene ban manager to list banned addresses', async () => {
        expect(sceneBanManagerMockedComponent.listBannedAddresses).toHaveBeenCalledWith('test-place-id')
      })

      it('should return the list of banned addresses', async () => {
        const result = await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: undefined,
          realmName: 'test-world.dcl.eth',
          parcel: undefined,
          isWorlds: true
        })

        expect(result).toEqual(['0x1111111111111111111111111111111111111111'])
      })
    })

    describe('when listing banned addresses with no results', () => {
      beforeEach(async () => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneBanManagerMockedComponent.listBannedAddresses.mockResolvedValue([])

        await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorlds: false
        })
      })

      it('should return an empty array', async () => {
        const result = await sceneBanComponent.listSceneBannedAddresses('0x0987654321098765432109876543210987654321', {
          sceneId: 'test-scene',
          realmName: 'test-realm',
          parcel: '-9,-9',
          isWorlds: false
        })

        expect(result).toEqual([])
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
            isWorlds: false
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
            isWorlds: false
          })
        ).rejects.toThrow('Database error')
      })
    })
  })
})
