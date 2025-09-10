import { WebhookEvent } from 'livekit-server-sdk'
import { createIngressEndedHandler } from '../../../src/logic/livekit-webhook/event-handlers/ingress-ended-handler'
import { ISceneStreamAccessManager } from '../../../src/types'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'

describe('Ingress Ended Handler', () => {
  let handler: ReturnType<typeof createIngressEndedHandler>
  let sceneStreamAccessManager: jest.Mocked<ISceneStreamAccessManager>
  let logs: jest.Mocked<ILoggerComponent>
  let stopStreamingMock: jest.MockedFunction<ISceneStreamAccessManager['stopStreaming']>

  beforeEach(() => {
    stopStreamingMock = jest.fn()

    sceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
      stopStreaming: stopStreamingMock
    })

    logs = createLoggerMockedComponent()

    handler = createIngressEndedHandler({
      sceneStreamAccessManager
    })
  })

  describe('when handling ingress ended event', () => {
    let ingressId: string
    let webhookEvent: WebhookEvent

    beforeEach(() => {
      ingressId = 'test-ingress-123'
      webhookEvent = {
        event: 'ingress_ended',
        ingressInfo: {
          ingressId,
          name: 'test-stream',
          url: 'rtmp://test.com/live/stream',
          streamKey: 'test-key',
          status: 'ended'
        }
      } as unknown as WebhookEvent
    })

    describe('and ingress info is missing', () => {
      beforeEach(() => {
        webhookEvent.ingressInfo = undefined
      })

      it('should log debug message and return early', async () => {
        await handler.handle(webhookEvent)

        expect(stopStreamingMock).not.toHaveBeenCalled()
      })
    })

    describe('and ingress info is present', () => {
      it('should stop streaming and log debug message', async () => {
        await handler.handle(webhookEvent)

        expect(stopStreamingMock).toHaveBeenCalledWith(ingressId)
      })

      describe('and stopping streaming fails', () => {
        let error: Error

        beforeEach(() => {
          error = new Error('Streaming stop failed')
          stopStreamingMock.mockRejectedValue(error)
        })

        it('should reject with the error', async () => {
          await expect(handler.handle(webhookEvent)).rejects.toThrow(error)

          expect(stopStreamingMock).toHaveBeenCalledWith(ingressId)
        })
      })
    })
  })
})
