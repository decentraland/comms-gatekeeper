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

describe('SceneBanComponent', () => {
  let sceneBanComponent: ISceneBansComponent
  let livekitMockedComponent: jest.Mocked<ILivekitComponent>
  let sceneManagerMockedComponent: jest.Mocked<ISceneManager>
  let sceneBanManagerMockedComponent: jest.Mocked<ISceneBanManager>
  let placesMockedComponent: jest.Mocked<IPlacesComponent>
  let logsMockedComponent: jest.Mocked<ILoggerComponent>

  let userScenePermissions: UserScenePermissions

  beforeEach(async () => {
    livekitMockedComponent = createLivekitMockedComponent()
    sceneBanManagerMockedComponent = createSceneBanManagerMockedComponent()
    sceneManagerMockedComponent = createSceneManagerMockedComponent()
    placesMockedComponent = createPlacesMockedComponent()
    logsMockedComponent = createLoggerMockedComponent()

    sceneBanComponent = createSceneBansComponent({
      sceneBanManager: sceneBanManagerMockedComponent,
      livekit: livekitMockedComponent,
      sceneManager: sceneManagerMockedComponent,
      places: placesMockedComponent,
      logs: logsMockedComponent
    })

    userScenePermissions = {
      owner: false,
      admin: false,
      hasExtendedPermissions: false,
      hasLandLease: false
    }
  })

  describe('when adding a scene ban', () => {
    let mockPlace: PlaceAttributes
    let mockWorldPlace: PlaceAttributes

    describe('when adding a ban for a regular scene', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        sceneBanManagerMockedComponent.addBan.mockResolvedValue(undefined)
        livekitMockedComponent.getRoomName.mockReturnValue('scene-test-realm:test-scene')
        livekitMockedComponent.removeParticipant.mockResolvedValue(undefined)

        mockPlace = createMockedPlace()
        mockWorldPlace = createMockedWorldPlace()
      })

      it('should call sceneBanManager.addBan with correct parameters', async () => {
        placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)

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

        expect(sceneBanManagerMockedComponent.addBan).toHaveBeenCalledWith({
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890',
          banned_by: '0x0987654321098765432109876543210987654321'
        })
      })

      it('should call livekit.getSceneRoomName with correct parameters', async () => {
        placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)

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

        expect(livekitMockedComponent.getRoomName).toHaveBeenCalledWith('test-realm', {
          isWorlds: false,
          sceneId: 'test-scene'
        })
      })

      it('should call livekit.removeParticipant with correct parameters', async () => {
        placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)

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

        expect(livekitMockedComponent.removeParticipant).toHaveBeenCalledWith(
          'scene-test-realm:test-scene',
          '0x1234567890123456789012345678901234567890'
        )
      })
    })

    describe('when adding a ban for a world', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        sceneBanManagerMockedComponent.addBan.mockResolvedValue(undefined)
        livekitMockedComponent.getRoomName.mockReturnValue('world-test-world.dcl.eth')
        livekitMockedComponent.removeParticipant.mockResolvedValue(undefined)
      })

      it('should call livekit.getRoomName with correct parameters for world', async () => {
        placesMockedComponent.getPlaceByWorldName.mockResolvedValue(mockWorldPlace)

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

        expect(livekitMockedComponent.getRoomName).toHaveBeenCalledWith('test-world.dcl.eth', { isWorlds: true })
      })

      it('should call livekit.removeParticipant with correct parameters', async () => {
        placesMockedComponent.getPlaceByWorldName.mockResolvedValue(mockWorldPlace)

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

        expect(livekitMockedComponent.removeParticipant).toHaveBeenCalledWith(
          'world-test-world.dcl.eth',
          '0x1234567890123456789012345678901234567890'
        )
      })
    })

    describe('when LiveKit removal fails', () => {
      beforeEach(() => {
        sceneManagerMockedComponent.isSceneOwnerOrAdmin.mockResolvedValue(true)
        sceneManagerMockedComponent.getUserScenePermissions.mockResolvedValue(userScenePermissions)
        placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)
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
        placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)

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
        placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)

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
          placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)

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
          placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)

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
          placesMockedComponent.getPlaceByParcel.mockResolvedValue(mockPlace)

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
})
