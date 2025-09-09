import { WebhookEvent } from 'livekit-server-sdk'
import { createIngressStartedHandler } from '../../../src/logic/livekit-webhook/event-handlers/ingress-started-handler'
import { ISceneStreamAccessManager } from '../../../src/types'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'

describe('Ingress Started Handler', () => {
  let handler: ReturnType<typeof createIngressStartedHandler>
  let sceneStreamAccessManager: jest.Mocked<ISceneStreamAccessManager>
  let logs: jest.Mocked<ILoggerComponent>
  let isStreamingMock: jest.MockedFunction<ISceneStreamAccessManager['isStreaming']>
  let startStreamingMock: jest.MockedFunction<ISceneStreamAccessManager['startStreaming']>

  beforeEach(() => {
    isStreamingMock = jest.fn()
    startStreamingMock = jest.fn()

    sceneStreamAccessManager = createSceneStreamAccessManagerMockedComponent({
      isStreaming: isStreamingMock,
      startStreaming: startStreamingMock
    })

    logs = createLoggerMockedComponent()

    handler = createIngressStartedHandler({
      sceneStreamAccessManager
    })
  })

  describe('when handling ingress started event', () => {
    let ingressId: string
    let webhookEvent: WebhookEvent

    beforeEach(() => {
      ingressId = 'test-ingress-123'
      webhookEvent = {
        event: 'ingress_started',
        ingressInfo: {
          ingressId,
          name: 'test-stream',
          url: 'rtmp://test.com/live/stream',
          streamKey: 'test-key',
          status: 'active'
        }
      } as unknown as WebhookEvent
    })

    describe('and ingress info is missing', () => {
      beforeEach(() => {
        webhookEvent.ingressInfo = undefined
      })

      it('should log debug message and return early', async () => {
        await handler.handle(webhookEvent)

        expect(sceneStreamAccessManager.isStreaming).not.toHaveBeenCalled()
        expect(sceneStreamAccessManager.startStreaming).not.toHaveBeenCalled()
      })
    })

    describe('and ingress info is present', () => {
      describe('and streaming is not active', () => {
        beforeEach(() => {
          isStreamingMock.mockResolvedValue(false)
        })

        it('should start streaming and log debug message', async () => {
          await handler.handle(webhookEvent)

          expect(isStreamingMock).toHaveBeenCalledWith(ingressId)
          expect(startStreamingMock).toHaveBeenCalledWith(ingressId)
        })
      })

      describe('and streaming is already active', () => {
        beforeEach(() => {
          isStreamingMock.mockResolvedValue(true)
        })

        it('should not start streaming and log debug message', async () => {
          await handler.handle(webhookEvent)

          expect(isStreamingMock).toHaveBeenCalledWith(ingressId)
          expect(startStreamingMock).not.toHaveBeenCalled()
        })
      })

      describe('and checking streaming status fails', () => {
        let error: Error

        beforeEach(() => {
          error = new Error('Database error')
          isStreamingMock.mockRejectedValue(error)
        })

        it('should reject with the error', async () => {
          await expect(handler.handle(webhookEvent)).rejects.toThrow(error)

          expect(isStreamingMock).toHaveBeenCalledWith(ingressId)
          expect(startStreamingMock).not.toHaveBeenCalled()
        })
      })

      describe('and starting streaming fails', () => {
        let error: Error

        beforeEach(() => {
          error = new Error('Streaming start failed')
          isStreamingMock.mockResolvedValue(false)
          startStreamingMock.mockRejectedValue(error)
        })

        it('should reject with the error', async () => {
          await expect(handler.handle(webhookEvent)).rejects.toThrow(error)

          expect(isStreamingMock).toHaveBeenCalledWith(ingressId)
          expect(startStreamingMock).toHaveBeenCalledWith(ingressId)
        })
      })
    })
  })
})
