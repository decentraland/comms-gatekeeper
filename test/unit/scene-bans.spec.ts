import { createSceneBansComponent } from '../../src/logic/scene-bans'
import { PlaceAttributes } from '../../src/types/places.type'
import { InvalidRequestError, UnauthorizedError } from '../../src/types/errors'
import { AddSceneBanParams } from '../../src/logic/scene-bans/types'
import { createLivekitMockedComponent } from '../mocks/livekit-mock'

describe('SceneBanComponent', () => {
  let mockedComponents: any
  let sceneBanComponent: any
  let livekitMockedComponent: any

  beforeEach(async () => {
    livekitMockedComponent = createLivekitMockedComponent()

    mockedComponents = {
      sceneBanManager: {
        addBan: jest.fn()
      },
      livekit: livekitMockedComponent,
      sceneManager: {
        isSceneOwnerOrAdmin: jest.fn(),
        getUserScenePermissions: jest.fn()
      },
      places: {
        getPlaceByParcelOrWorldName: jest.fn()
      },
      logs: {
        getLogger: jest.fn().mockReturnValue({
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn()
        })
      }
    }

    sceneBanComponent = createSceneBansComponent(mockedComponents)
  })

  describe('addSceneBan', () => {
    const mockPlace: PlaceAttributes = {
      id: 'test-place-id',
      title: 'Test Place',
      description: 'Test Description',
      image: null,
      highlighted_image: null,
      owner: '0x1234567890123456789012345678901234567890',
      positions: ['-9,-9'],
      base_position: '-9,-9',
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
      user_favorite: false
    }

    const mockWorldPlace: PlaceAttributes = {
      id: 'test-world-id',
      title: 'Test World',
      description: 'Test World Description',
      image: null,
      highlighted_image: null,
      owner: '0x1234567890123456789012345678901234567890',
      positions: ['20,20'],
      base_position: '20,20',
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
      world_name: 'test-world.dcl.eth',
      deployed_at: new Date(),
      categories: [],
      user_like: false,
      user_dislike: false,
      user_favorite: false
    }

    describe('when adding a ban for a regular scene', () => {
      beforeEach(() => {
        mockedComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
        mockedComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
          owner: false,
          admin: false,
          hasExtendedPermissions: false
        })
        mockedComponents.sceneBanManager.addBan.mockResolvedValue(undefined)
        mockedComponents.livekit.getRoomName.mockReturnValue('scene-test-realm:test-scene')
        mockedComponents.livekit.removeParticipant.mockResolvedValue(undefined)
      })

      it('should call sceneBanManager.addBan with correct parameters', async () => {
        mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockPlace)

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

        expect(mockedComponents.sceneBanManager.addBan).toHaveBeenCalledWith({
          place_id: 'test-place-id',
          banned_address: '0x1234567890123456789012345678901234567890',
          banned_by: '0x0987654321098765432109876543210987654321'
        })
      })

      it('should call livekit.getSceneRoomName with correct parameters', async () => {
        mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockPlace)

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

        expect(mockedComponents.livekit.getRoomName).toHaveBeenCalledWith('test-realm', {
          isWorlds: false,
          sceneId: 'test-scene'
        })
      })

      it('should call livekit.removeParticipant with correct parameters', async () => {
        mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockPlace)

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

        expect(mockedComponents.livekit.removeParticipant).toHaveBeenCalledWith(
          'scene-test-realm:test-scene',
          '0x1234567890123456789012345678901234567890'
        )
      })
    })

    describe('when adding a ban for a world', () => {
      beforeEach(() => {
        mockedComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
        mockedComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
          owner: false,
          admin: false,
          hasExtendedPermissions: false
        })
        mockedComponents.sceneBanManager.addBan.mockResolvedValue(undefined)
        mockedComponents.livekit.getRoomName.mockReturnValue('world-test-world.dcl.eth')
        mockedComponents.livekit.removeParticipant.mockResolvedValue(undefined)
      })

      it('should call livekit.getRoomName with correct parameters for world', async () => {
        mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockWorldPlace)

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

        expect(mockedComponents.livekit.getRoomName).toHaveBeenCalledWith('test-world.dcl.eth', { isWorlds: true })
      })

      it('should call livekit.removeParticipant with correct parameters', async () => {
        mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockWorldPlace)

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

        expect(mockedComponents.livekit.removeParticipant).toHaveBeenCalledWith(
          'world-test-world.dcl.eth',
          '0x1234567890123456789012345678901234567890'
        )
      })
    })

    describe('when LiveKit removal fails', () => {
      beforeEach(() => {
        mockedComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
        mockedComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
          owner: false,
          admin: false,
          hasExtendedPermissions: false
        })
        mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockPlace)
        mockedComponents.livekit.getRoomName.mockReturnValue('scene-test-realm:test-scene')
        mockedComponents.livekit.removeParticipant.mockRejectedValue(new Error('LiveKit connection failed'))
      })

      it('should propagate the LiveKit error', async () => {
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
        ).rejects.toThrow('LiveKit connection failed')
      })
    })

    describe('when sceneBanManager.addBan fails', () => {
      beforeEach(() => {
        mockedComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
        mockedComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
          owner: false,
          admin: false,
          hasExtendedPermissions: false
        })
        mockedComponents.sceneBanManager.addBan.mockRejectedValue(new Error('Database error'))
      })

      it('should propagate the error', async () => {
        mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockPlace)

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
        mockedComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw UnauthorizedError', async () => {
        mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockPlace)

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
          mockedComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
          mockedComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
            owner: true,
            admin: false,
            hasExtendedPermissions: false
          })
        })

        it('should throw InvalidRequestError', async () => {
          mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockPlace)

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
          mockedComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
          mockedComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
            owner: false,
            admin: true,
            hasExtendedPermissions: false
          })
        })

        it('should throw InvalidRequestError', async () => {
          mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockPlace)

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
          mockedComponents.sceneManager.isSceneOwnerOrAdmin.mockResolvedValue(true)
          mockedComponents.sceneManager.getUserScenePermissions.mockResolvedValue({
            owner: false,
            admin: false,
            hasExtendedPermissions: true
          })
        })

        it('should throw InvalidRequestError', async () => {
          mockedComponents.places.getPlaceByParcelOrWorldName.mockResolvedValue(mockPlace)

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
