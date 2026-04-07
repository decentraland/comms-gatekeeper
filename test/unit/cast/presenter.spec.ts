import { Room } from 'livekit-server-sdk'
import { createCastComponent } from '../../../src/logic/cast/cast'
import { ICastComponent } from '../../../src/logic/cast/types'
import { NotSceneAdminError, NoActiveStreamError } from '../../../src/logic/cast/errors'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createSceneManagerMockedComponent } from '../../mocks/scene-manager-mock'
import { createPlacesMockedComponent, createMockedPlace } from '../../mocks/places-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'

function createRoomWithPresenters(presenters: string[]): Room {
  return new Room({ metadata: JSON.stringify({ presenters }) })
}

describe('when managing presenters', () => {
  let castComponent: ICastComponent
  let mockLivekit: ReturnType<typeof createLivekitMockedComponent>
  let mockSceneStreamAccessManager: ReturnType<typeof createSceneStreamAccessManagerMockedComponent>
  let mockSceneManager: ReturnType<typeof createSceneManagerMockedComponent>
  let mockPlaces: ReturnType<typeof createPlacesMockedComponent>

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when adding a presenter', () => {
    describe('and the room exists', () => {
      let identity: string

      beforeEach(() => {
        identity = '0x1234567890abcdef1234567890abcdef12345678'

        mockLivekit = createLivekitMockedComponent({
          getRoom: jest.fn().mockResolvedValue(createRoomWithPresenters([])),
          appendToRoomMetadataArray: jest.fn().mockResolvedValue(undefined)
        })

        castComponent = createCastComponent({
          livekit: mockLivekit,
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: createSceneStreamAccessManagerMockedComponent(),
          sceneManager: createSceneManagerMockedComponent(),
          places: createPlacesMockedComponent(),
          config: createConfigMockedComponent()
        })
      })

      it('should append the identity to the presenters array in room metadata', async () => {
        await castComponent.addPresenter('scene-test:bafytest', identity)

        expect(mockLivekit.appendToRoomMetadataArray).toHaveBeenCalledWith(
          'scene-test:bafytest',
          'presenters',
          identity
        )
      })

      it('should ensure the room exists before appending', async () => {
        await castComponent.addPresenter('scene-test:bafytest', identity)

        expect(mockLivekit.getRoom).toHaveBeenCalledWith('scene-test:bafytest')
      })
    })
  })

  describe('when promoting a presenter', () => {
    describe('and the caller is an admin', () => {
      let participantIdentity: string

      beforeEach(() => {
        participantIdentity = '0x1234567890abcdef1234567890abcdef12345678'

        mockLivekit = createLivekitMockedComponent({
          getRoom: jest.fn().mockResolvedValue(createRoomWithPresenters([])),
          appendToRoomMetadataArray: jest.fn().mockResolvedValue(undefined)
        })

        mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
          getAccessByRoomId: jest.fn().mockResolvedValue({
            place_id: 'place-123',
            room_id: 'scene-test:bafytest'
          })
        })

        mockPlaces = createPlacesMockedComponent({
          getPlaceStatusByIds: jest
            .fn()
            .mockResolvedValue([createMockedPlace({ id: 'place-123', title: 'Test', owner: '0xowner' })])
        })

        mockSceneManager = createSceneManagerMockedComponent({
          isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(true)
        })

        castComponent = createCastComponent({
          livekit: mockLivekit,
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: mockSceneStreamAccessManager,
          sceneManager: mockSceneManager,
          places: mockPlaces,
          config: createConfigMockedComponent()
        })
      })

      it('should append the participant to the presenters list in room metadata', async () => {
        await castComponent.promotePresenter('scene-test:bafytest', participantIdentity, '0xadmin')

        expect(mockLivekit.appendToRoomMetadataArray).toHaveBeenCalledWith(
          'scene-test:bafytest',
          'presenters',
          participantIdentity
        )
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
          getAccessByRoomId: jest.fn().mockResolvedValue({
            place_id: 'place-123',
            room_id: 'scene-test:bafytest'
          })
        })

        mockPlaces = createPlacesMockedComponent({
          getPlaceStatusByIds: jest
            .fn()
            .mockResolvedValue([createMockedPlace({ id: 'place-123', title: 'Test', owner: '0xowner' })])
        })

        mockSceneManager = createSceneManagerMockedComponent({
          isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(false)
        })

        castComponent = createCastComponent({
          livekit: createLivekitMockedComponent(),
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: mockSceneStreamAccessManager,
          sceneManager: mockSceneManager,
          places: mockPlaces,
          config: createConfigMockedComponent()
        })
      })

      it('should throw a NotSceneAdminError', async () => {
        await expect(
          castComponent.promotePresenter('scene-test:bafytest', '0x1234567890abcdef1234567890abcdef12345678', '0xnobody')
        ).rejects.toThrow(NotSceneAdminError)
      })
    })

    describe('and no active stream exists for the room', () => {
      beforeEach(() => {
        mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
          getAccessByRoomId: jest.fn().mockResolvedValue(null)
        })

        castComponent = createCastComponent({
          livekit: createLivekitMockedComponent(),
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: mockSceneStreamAccessManager,
          sceneManager: createSceneManagerMockedComponent(),
          places: createPlacesMockedComponent(),
          config: createConfigMockedComponent()
        })
      })

      it('should throw a NoActiveStreamError', async () => {
        await expect(
          castComponent.promotePresenter('scene-test:bafytest', '0x1234567890abcdef1234567890abcdef12345678', '0xadmin')
        ).rejects.toThrow(NoActiveStreamError)
      })
    })
  })

  describe('when demoting a presenter', () => {
    describe('and the caller is an admin', () => {
      let participantIdentity: string

      beforeEach(() => {
        participantIdentity = '0x1234567890abcdef1234567890abcdef12345678'

        mockLivekit = createLivekitMockedComponent({
          removeFromRoomMetadataArray: jest.fn().mockResolvedValue(undefined)
        })

        mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
          getAccessByRoomId: jest.fn().mockResolvedValue({
            place_id: 'place-123',
            room_id: 'scene-test:bafytest'
          })
        })

        mockPlaces = createPlacesMockedComponent({
          getPlaceStatusByIds: jest
            .fn()
            .mockResolvedValue([createMockedPlace({ id: 'place-123', title: 'Test', owner: '0xowner' })])
        })

        mockSceneManager = createSceneManagerMockedComponent({
          isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(true)
        })

        castComponent = createCastComponent({
          livekit: mockLivekit,
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: mockSceneStreamAccessManager,
          sceneManager: mockSceneManager,
          places: mockPlaces,
          config: createConfigMockedComponent()
        })
      })

      it('should remove the participant from the presenters list', async () => {
        await castComponent.demotePresenter('scene-test:bafytest', participantIdentity, '0xadmin')

        expect(mockLivekit.removeFromRoomMetadataArray).toHaveBeenCalledWith(
          'scene-test:bafytest',
          'presenters',
          participantIdentity
        )
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
          getAccessByRoomId: jest.fn().mockResolvedValue({
            place_id: 'place-123',
            room_id: 'scene-test:bafytest'
          })
        })

        mockPlaces = createPlacesMockedComponent({
          getPlaceStatusByIds: jest
            .fn()
            .mockResolvedValue([createMockedPlace({ id: 'place-123', title: 'Test', owner: '0xowner' })])
        })

        mockSceneManager = createSceneManagerMockedComponent({
          isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(false)
        })

        castComponent = createCastComponent({
          livekit: createLivekitMockedComponent(),
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: mockSceneStreamAccessManager,
          sceneManager: mockSceneManager,
          places: mockPlaces,
          config: createConfigMockedComponent()
        })
      })

      it('should throw a NotSceneAdminError', async () => {
        await expect(
          castComponent.demotePresenter('scene-test:bafytest', '0x1234567890abcdef1234567890abcdef12345678', '0xnobody')
        ).rejects.toThrow(NotSceneAdminError)
      })
    })
  })

  describe('when getting presenters', () => {
    describe('and the room has presenters', () => {
      let presenterIdentity: string

      beforeEach(() => {
        presenterIdentity = '0x1234567890abcdef1234567890abcdef12345678'

        mockLivekit = createLivekitMockedComponent({
          getRoomInfo: jest.fn().mockResolvedValue(createRoomWithPresenters([presenterIdentity]))
        })

        mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
          getAccessByRoomId: jest.fn().mockResolvedValue({
            place_id: 'place-123',
            room_id: 'scene-test:bafytest'
          })
        })

        mockPlaces = createPlacesMockedComponent({
          getPlaceStatusByIds: jest
            .fn()
            .mockResolvedValue([createMockedPlace({ id: 'place-123', title: 'Test', owner: '0xowner' })])
        })

        mockSceneManager = createSceneManagerMockedComponent({
          isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(true)
        })

        castComponent = createCastComponent({
          livekit: mockLivekit,
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: mockSceneStreamAccessManager,
          sceneManager: mockSceneManager,
          places: mockPlaces,
          config: createConfigMockedComponent()
        })
      })

      it('should return the presenters list from room metadata', async () => {
        const result = await castComponent.getPresenters('scene-test:bafytest', '0xadmin')

        expect(result.presenters).toEqual([presenterIdentity])
      })
    })

    describe('and the room has no presenters', () => {
      beforeEach(() => {
        mockLivekit = createLivekitMockedComponent({
          getRoomInfo: jest.fn().mockResolvedValue(createRoomWithPresenters([]))
        })

        mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
          getAccessByRoomId: jest.fn().mockResolvedValue({
            place_id: 'place-123',
            room_id: 'scene-test:bafytest'
          })
        })

        mockPlaces = createPlacesMockedComponent({
          getPlaceStatusByIds: jest
            .fn()
            .mockResolvedValue([createMockedPlace({ id: 'place-123', title: 'Test', owner: '0xowner' })])
        })

        mockSceneManager = createSceneManagerMockedComponent({
          isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(true)
        })

        castComponent = createCastComponent({
          livekit: mockLivekit,
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: mockSceneStreamAccessManager,
          sceneManager: mockSceneManager,
          places: mockPlaces,
          config: createConfigMockedComponent()
        })
      })

      it('should return an empty array', async () => {
        const result = await castComponent.getPresenters('scene-test:bafytest', '0xadmin')

        expect(result.presenters).toEqual([])
      })
    })

    describe('and the room has no metadata', () => {
      beforeEach(() => {
        mockLivekit = createLivekitMockedComponent({
          getRoomInfo: jest.fn().mockResolvedValue(new Room())
        })

        mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
          getAccessByRoomId: jest.fn().mockResolvedValue({
            place_id: 'place-123',
            room_id: 'scene-test:bafytest'
          })
        })

        mockPlaces = createPlacesMockedComponent({
          getPlaceStatusByIds: jest
            .fn()
            .mockResolvedValue([createMockedPlace({ id: 'place-123', title: 'Test', owner: '0xowner' })])
        })

        mockSceneManager = createSceneManagerMockedComponent({
          isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(true)
        })

        castComponent = createCastComponent({
          livekit: mockLivekit,
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: mockSceneStreamAccessManager,
          sceneManager: mockSceneManager,
          places: mockPlaces,
          config: createConfigMockedComponent()
        })
      })

      it('should return an empty array', async () => {
        const result = await castComponent.getPresenters('scene-test:bafytest', '0xadmin')

        expect(result.presenters).toEqual([])
      })
    })

    describe('and the caller is not an admin', () => {
      beforeEach(() => {
        mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
          getAccessByRoomId: jest.fn().mockResolvedValue({
            place_id: 'place-123',
            room_id: 'scene-test:bafytest'
          })
        })

        mockPlaces = createPlacesMockedComponent({
          getPlaceStatusByIds: jest
            .fn()
            .mockResolvedValue([createMockedPlace({ id: 'place-123', title: 'Test', owner: '0xowner' })])
        })

        mockSceneManager = createSceneManagerMockedComponent({
          isSceneOwnerOrAdmin: jest.fn().mockResolvedValue(false)
        })

        castComponent = createCastComponent({
          livekit: createLivekitMockedComponent(),
          logs: createLoggerMockedComponent(),
          sceneStreamAccessManager: mockSceneStreamAccessManager,
          sceneManager: mockSceneManager,
          places: mockPlaces,
          config: createConfigMockedComponent()
        })
      })

      it('should throw a NotSceneAdminError', async () => {
        await expect(castComponent.getPresenters('scene-test:bafytest', '0xnobody')).rejects.toThrow(
          NotSceneAdminError
        )
      })
    })
  })
})
