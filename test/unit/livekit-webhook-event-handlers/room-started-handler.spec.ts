import { WebhookEvent } from 'livekit-server-sdk'
import { createRoomStartedHandler } from '../../../src/logic/livekit-webhook/event-handlers/room-started-handler'
import { ISceneBansComponent } from '../../../src/logic/scene-bans/types'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneBansMockedComponent } from '../../mocks/scene-bans-mock'

describe('Room Started Handler', () => {
  let handler: ReturnType<typeof createRoomStartedHandler>
  let sceneBans: jest.Mocked<ISceneBansComponent>
  let logs: jest.Mocked<ILoggerComponent>
  let updateRoomMetadataWithBansMock: jest.MockedFunction<ISceneBansComponent['updateRoomMetadataWithBans']>

  beforeEach(async () => {
    updateRoomMetadataWithBansMock = jest.fn()

    sceneBans = createSceneBansMockedComponent({
      updateRoomMetadataWithBans: updateRoomMetadataWithBansMock
    })

    logs = createLoggerMockedComponent()

    handler = createRoomStartedHandler({
      sceneBans,
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

        expect(updateRoomMetadataWithBansMock).not.toHaveBeenCalled()
      })
    })

    describe('and room data is present', () => {
      it('should call sceneBans.updateRoomMetadataWithBans with the room', async () => {
        await handler.handle(webhookEvent)

        expect(updateRoomMetadataWithBansMock).toHaveBeenCalledWith(webhookEvent.room)
      })

      it('should propagate errors from sceneBans', async () => {
        updateRoomMetadataWithBansMock.mockRejectedValue(new Error('Scene bans error'))

        await expect(handler.handle(webhookEvent)).rejects.toThrow('Scene bans error')

        expect(updateRoomMetadataWithBansMock).toHaveBeenCalledWith(webhookEvent.room)
      })
    })
  })
})
