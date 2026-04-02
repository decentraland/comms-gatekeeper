import { ParticipantInfo } from 'livekit-server-sdk'
import { createCastComponent } from '../../../src/logic/cast/cast'
import { ICastComponent } from '../../../src/logic/cast/types'
import { NotSceneAdminError, NoActiveStreamError } from '../../../src/logic/cast/errors'
import { createLivekitMockedComponent } from '../../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'
import { createSceneManagerMockedComponent } from '../../mocks/scene-manager-mock'
import { createPlacesMockedComponent, createMockedPlace } from '../../mocks/places-mock'
import { createConfigMockedComponent } from '../../mocks/config-mock'

const ROOM_ID = 'scene-test-realm:bafkreiscene123'
const PLACE_ID = 'place-123'
const ADMIN_ADDRESS = '0xadmin'
const NON_ADMIN_ADDRESS = '0xnobody'
const PARTICIPANT_IDENTITY = 'stream:place-123:1234567890'

describe('when managing presenters', () => {
  let castComponent: ICastComponent
  let mockLivekit: ReturnType<typeof createLivekitMockedComponent>
  let mockSceneStreamAccessManager: ReturnType<typeof createSceneStreamAccessManagerMockedComponent>
  let mockSceneManager: ReturnType<typeof createSceneManagerMockedComponent>
  let mockPlaces: ReturnType<typeof createPlacesMockedComponent>

  const mockPlace = createMockedPlace({ id: PLACE_ID, title: 'Test Place', owner: '0xowner123' })

  const validStreamAccess = {
    id: 'access-123',
    place_id: PLACE_ID,
    streaming_key: 'valid-stream-key',
    streaming_url: 'rtmp://test-url',
    ingress_id: 'test-ingress-id',
    created_at: Date.now(),
    active: true,
    streaming: false,
    streaming_start_time: 0,
    room_id: ROOM_ID,
    expiration_time: String(Date.now() + 2 * 24 * 60 * 60 * 1000)
  }

  beforeEach(() => {
    mockLivekit = createLivekitMockedComponent({
      updateParticipantMetadata: jest.fn().mockResolvedValue(undefined),
      listRoomParticipants: jest.fn().mockResolvedValue([
        new ParticipantInfo({ identity: PARTICIPANT_IDENTITY, metadata: JSON.stringify({ role: 'presenter' }) }),
        new ParticipantInfo({ identity: 'watch:room:999', metadata: JSON.stringify({ role: 'watcher' }) }),
        new ParticipantInfo({ identity: 'watch:room:888' })
      ])
    })

    mockSceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
      getAccessByRoomId: jest.fn().mockResolvedValue(validStreamAccess)
    })

    mockSceneManager = createSceneManagerMockedComponent({
      isSceneOwnerOrAdmin: jest.fn().mockImplementation((_place, address) =>
        Promise.resolve(address.toLowerCase() === ADMIN_ADDRESS)
      )
    })

    mockPlaces = createPlacesMockedComponent({
      getPlaceStatusByIds: jest.fn().mockResolvedValue([mockPlace])
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

  describe('promotePresenter', () => {
    it('should set role=presenter in participant metadata when called by an admin', async () => {
      await castComponent.promotePresenter(ROOM_ID, PARTICIPANT_IDENTITY, ADMIN_ADDRESS)

      expect(mockLivekit.updateParticipantMetadata).toHaveBeenCalledWith(
        ROOM_ID,
        PARTICIPANT_IDENTITY,
        { role: 'presenter' }
      )
    })

    it('should throw NotSceneAdminError when called by a non-admin', async () => {
      await expect(
        castComponent.promotePresenter(ROOM_ID, PARTICIPANT_IDENTITY, NON_ADMIN_ADDRESS)
      ).rejects.toThrow(NotSceneAdminError)
    })

    it('should throw NoActiveStreamError when room does not exist', async () => {
      mockSceneStreamAccessManager.getAccessByRoomId.mockResolvedValue(null)

      await expect(
        castComponent.promotePresenter(ROOM_ID, PARTICIPANT_IDENTITY, ADMIN_ADDRESS)
      ).rejects.toThrow(NoActiveStreamError)
    })
  })

  describe('demotePresenter', () => {
    it('should set role=watcher in participant metadata when called by an admin', async () => {
      await castComponent.demotePresenter(ROOM_ID, PARTICIPANT_IDENTITY, ADMIN_ADDRESS)

      expect(mockLivekit.updateParticipantMetadata).toHaveBeenCalledWith(
        ROOM_ID,
        PARTICIPANT_IDENTITY,
        { role: 'watcher' }
      )
    })

    it('should throw NotSceneAdminError when called by a non-admin', async () => {
      await expect(
        castComponent.demotePresenter(ROOM_ID, PARTICIPANT_IDENTITY, NON_ADMIN_ADDRESS)
      ).rejects.toThrow(NotSceneAdminError)
    })
  })

  describe('getPresenters', () => {
    it('should return identities of participants with role=presenter', async () => {
      const result = await castComponent.getPresenters(ROOM_ID, ADMIN_ADDRESS)

      expect(result.presenters).toEqual([PARTICIPANT_IDENTITY])
    })

    it('should return empty array when no presenters are in the room', async () => {
      mockLivekit.listRoomParticipants.mockResolvedValue([
        new ParticipantInfo({ identity: 'watch:room:999', metadata: JSON.stringify({ role: 'watcher' }) })
      ])

      const result = await castComponent.getPresenters(ROOM_ID, ADMIN_ADDRESS)

      expect(result.presenters).toEqual([])
    })

    it('should throw NotSceneAdminError when called by a non-admin', async () => {
      await expect(castComponent.getPresenters(ROOM_ID, NON_ADMIN_ADDRESS)).rejects.toThrow(NotSceneAdminError)
    })
  })
})
