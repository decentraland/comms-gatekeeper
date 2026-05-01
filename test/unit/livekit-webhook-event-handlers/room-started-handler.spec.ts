import { WebhookEvent } from 'livekit-server-sdk'
import { createRoomStartedHandler } from '../../../src/logic/livekit-webhook/event-handlers/room-started-handler'
import { IRoomMetadataSyncComponent } from '../../../src/logic/room-metadata-sync/types'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createRoomMetadataSyncMockedComponent } from '../../mocks/room-metadata-sync-mock'

describe('Room Started Handler', () => {
  let handler: ReturnType<typeof createRoomStartedHandler>
  let roomMetadataSync: jest.Mocked<IRoomMetadataSyncComponent>
  let logs: jest.Mocked<ILoggerComponent>

  beforeEach(async () => {
    roomMetadataSync = createRoomMetadataSyncMockedComponent()
    logs = createLoggerMockedComponent()

    handler = createRoomStartedHandler({
      roomMetadataSync,
      logs
    })
  })

  describe('when handling room started event', () => {
    let webhookEvent: WebhookEvent

    beforeEach(() => {
      webhookEvent = {
        event: 'room_started',
        room: {
          name: 'scene-realm1:scene-id-123'
        }
      } as unknown as WebhookEvent
    })

    describe('and room data is missing', () => {
      beforeEach(() => {
        webhookEvent.room = undefined
      })

      it('should return early without processing', async () => {
        await handler.handle(webhookEvent)

        expect(roomMetadataSync.updateRoomMetadataForRoom).not.toHaveBeenCalled()
      })
    })

    describe('and room data is present', () => {
      it('should call roomMetadataSync.updateRoomMetadataForRoom with the room', async () => {
        await handler.handle(webhookEvent)

        expect(roomMetadataSync.updateRoomMetadataForRoom).toHaveBeenCalledWith(webhookEvent.room)
      })

      it('should propagate errors from roomMetadataSync', async () => {
        roomMetadataSync.updateRoomMetadataForRoom.mockRejectedValue(new Error('metadata sync error'))

        await expect(handler.handle(webhookEvent)).rejects.toThrow('metadata sync error')

        expect(roomMetadataSync.updateRoomMetadataForRoom).toHaveBeenCalledWith(webhookEvent.room)
      })
    })
  })
})
