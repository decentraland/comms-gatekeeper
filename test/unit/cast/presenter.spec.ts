import { Room } from 'livekit-server-sdk'
import { createCastComponent } from '../../../src/logic/cast/cast'
import { ICastComponent } from '../../../src/logic/cast/types'
import { NotSceneAdminError, NoActiveStreamError } from '../../../src/logic/cast/errors'
import { RoomMetadata } from '../../../src/types/livekit.type'
import { SceneStreamAccess } from '../../../src/types'
import { PlaceAttributes } from '../../../src/types/places.type'
import { PlaceNotFoundError } from '../../../src/types/errors'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createSceneManagerMockedComponent } from '../../mocks/scene-manager-mock'
import { createPlacesMockedComponent, createMockedPlace } from '../../mocks/places-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'
import { createSceneBanManagerMockedComponent } from '../../mocks/scene-ban-manager-mock'
import { createUserModerationMockedComponent } from '../../mocks/user-moderation-mock'

function createRoomWithPresenters(presenters: string[]): Room {
  return new Room({ metadata: JSON.stringify({ presenters }) })
}

describe('when managing presenters', () => {
  const roomId = 'scene-test:bafytest'
  const identity = '0x1234567890abcdef1234567890abcdef12345678'

  let castComponent: ICastComponent
  let mockLivekit: ReturnType<typeof createLivekitMockedComponent>
  let mockSceneStreamAccessManager: ReturnType<typeof createSceneStreamAccessManagerMockedComponent>
  let mockSceneManager: ReturnType<typeof createSceneManagerMockedComponent>
  let mockPlaces: ReturnType<typeof createPlacesMockedComponent>
  let mockLogs: ReturnType<typeof createLoggerMockedComponent>
  let scenePlace: PlaceAttributes

  beforeEach(() => {
    mockLivekit = createLivekitMockedComponent({
      getRoom: jest.fn().mockResolvedValue(createRoomWithPresenters([])),
      appendToRoomMetadataArray: jest.fn().mockResolvedValue(undefined),
      removeFromRoomMetadataArray: jest.fn().mockResolvedValue(undefined),
      getRoomInfo: jest.fn().mockResolvedValue(createRoomWithPresenters([]))
    })

    mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
      getAccessByRoomId: jest.fn().mockResolvedValue({
        place_id: 'place-123',
        room_id: roomId
      })
    })

    scenePlace = createMockedPlace({ id: 'place-123', owner: '0xowner', positions: ['20,2', '20,3'] })

    mockPlaces = createPlacesMockedComponent({
      getPlaceById: jest.fn().mockResolvedValue(scenePlace)
    })

    mockSceneManager = createSceneManagerMockedComponent({
      isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(true)
    })

    mockLogs = createLoggerMockedComponent()

    castComponent = createCastComponent({
      livekit: mockLivekit,
      logs: mockLogs,
      sceneStreamAccessManager: mockSceneStreamAccessManager,
      sceneManager: mockSceneManager,
      places: mockPlaces,
      config: createConfigMockedComponent(),
      sceneBanManager: createSceneBanManagerMockedComponent(),
      userModeration: createUserModerationMockedComponent()
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when adding a presenter', () => {
    describe('and the room exists', () => {
      it('should append the identity to the presenters array in room metadata', async () => {
        await castComponent.addPresenter(roomId, identity)

        expect(mockLivekit.appendToRoomMetadataArray).toHaveBeenCalledWith(roomId, 'presenters', identity)
      })

      it('should ensure the room exists before appending', async () => {
        await castComponent.addPresenter(roomId, identity)

        expect(mockLivekit.getRoom).toHaveBeenCalledWith(roomId)
      })
    })
  })

  describe('when promoting a presenter', () => {
    describe('and the caller is an admin', () => {
      it('should append the participant to the presenters list in room metadata', async () => {
        await castComponent.promotePresenter(roomId, identity, '0xadmin')

        expect(mockLivekit.appendToRoomMetadataArray).toHaveBeenCalledWith(roomId, 'presenters', identity)
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw a NotSceneAdminError', async () => {
        await expect(castComponent.promotePresenter(roomId, identity, '0xnobody')).rejects.toThrow(NotSceneAdminError)
      })
    })

    describe('and no active stream exists for the room', () => {
      beforeEach(() => {
        mockSceneStreamAccessManager.getAccessByRoomId.mockResolvedValue(null)
      })

      it('should throw a NoActiveStreamError', async () => {
        await expect(castComponent.promotePresenter(roomId, identity, '0xadmin')).rejects.toThrow(NoActiveStreamError)
      })
    })
  })

  describe('when promoting a presenter in a local preview room', () => {
    const localPreviewRoomId = 'scene-localpreview:bafytest'

    beforeEach(() => {
      mockLivekit.getRoomMetadataFromRoomName.mockReturnValue({ realmName: 'localpreview' } as RoomMetadata)
      mockSceneStreamAccessManager.getAccessByRoomId.mockResolvedValue({
        place_id: localPreviewRoomId,
        room_id: localPreviewRoomId
      } as SceneStreamAccess)
    })

    it('should skip admin validation and succeed', async () => {
      await castComponent.promotePresenter(localPreviewRoomId, identity, '0xanyone')

      expect(mockLivekit.appendToRoomMetadataArray).toHaveBeenCalledWith(localPreviewRoomId, 'presenters', identity)
    })

    it('should not resolve the place', async () => {
      await castComponent.promotePresenter(localPreviewRoomId, identity, '0xanyone')

      expect(mockPlaces.getPlaceById).not.toHaveBeenCalled()
    })

    it('should not call sceneManager.isSceneOwnerOrAdmin', async () => {
      await castComponent.promotePresenter(localPreviewRoomId, identity, '0xanyone')

      expect(mockSceneManager.isSceneOwnerOrAdmin).not.toHaveBeenCalled()
    })
  })

  describe('when demoting a presenter', () => {
    describe('and the caller is an admin', () => {
      it('should remove the participant from the presenters list', async () => {
        await castComponent.demotePresenter(roomId, identity, '0xadmin')

        expect(mockLivekit.removeFromRoomMetadataArray).toHaveBeenCalledWith(roomId, 'presenters', identity)
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw a NotSceneAdminError', async () => {
        await expect(castComponent.demotePresenter(roomId, identity, '0xnobody')).rejects.toThrow(NotSceneAdminError)
      })
    })

    describe('and no active stream exists for the room', () => {
      beforeEach(() => {
        mockSceneStreamAccessManager.getAccessByRoomId.mockResolvedValue(null)
      })

      it('should throw a NoActiveStreamError', async () => {
        await expect(castComponent.demotePresenter(roomId, identity, '0xadmin')).rejects.toThrow(NoActiveStreamError)
      })
    })
  })

  describe('when getting presenters', () => {
    describe('and the room has presenters', () => {
      beforeEach(() => {
        mockLivekit.getRoomInfo.mockResolvedValue(createRoomWithPresenters([identity]))
      })

      it('should return the presenters list from room metadata', async () => {
        const result = await castComponent.getPresenters(roomId, '0xadmin')

        expect(result.presenters).toEqual([identity])
      })
    })

    describe('and the room has no presenters', () => {
      describe('and the metadata has an empty presenters array', () => {
        it('should return an empty array', async () => {
          const result = await castComponent.getPresenters(roomId, '0xadmin')

          expect(result.presenters).toEqual([])
        })
      })

      describe('and the room has no metadata', () => {
        beforeEach(() => {
          mockLivekit.getRoomInfo.mockResolvedValue(new Room())
        })

        it('should return an empty array', async () => {
          const result = await castComponent.getPresenters(roomId, '0xadmin')

          expect(result.presenters).toEqual([])
        })
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        mockSceneManager.isSceneOwnerOrAdmin.mockResolvedValue(false)
      })

      it('should throw a NotSceneAdminError', async () => {
        await expect(castComponent.getPresenters(roomId, '0xnobody')).rejects.toThrow(NotSceneAdminError)
      })
    })

    describe('and the caller is an admin', () => {
      it('should resolve the full place from the stream access place id', async () => {
        await castComponent.getPresenters(roomId, '0xadmin')

        expect(mockPlaces.getPlaceById).toHaveBeenCalledWith('place-123')
      })

      it('should check the caller against the full place, including all of its parcels', async () => {
        await castComponent.getPresenters(roomId, '0xadmin')

        expect(mockSceneManager.isSceneOwnerOrAdmin).toHaveBeenCalledWith(scenePlace, '0xadmin')
      })
    })

    describe('and the stream place no longer exists', () => {
      beforeEach(() => {
        mockPlaces.getPlaceById.mockRejectedValueOnce(new PlaceNotFoundError('No place found with id place-123'))
      })

      it('should throw a PlaceNotFoundError', async () => {
        await expect(castComponent.getPresenters(roomId, '0xadmin')).rejects.toThrow(PlaceNotFoundError)
      })
    })
  })
})
