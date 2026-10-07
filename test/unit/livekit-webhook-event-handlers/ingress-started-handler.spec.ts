import { IngressInfo, WebhookEvent } from 'livekit-server-sdk'
import { createIngressStartedHandler } from '../../../src/logic/livekit-webhook/event-handlers/ingress-started-handler'
import { createSceneStreamAccessManagerMockedComponent } from '../../mocks/scene-stream-access-manager-mock'

describe('when handling an ingress-started webhook', () => {
  let handler: ReturnType<typeof createIngressStartedHandler>
  let manager: ReturnType<typeof createSceneStreamAccessManagerMockedComponent>
  let event: WebhookEvent

  beforeEach(() => {
    manager = createSceneStreamAccessManagerMockedComponent()
    handler = createIngressStartedHandler({ sceneStreamAccessManager: manager })
    event = new WebhookEvent({ ingressInfo: new IngressInfo({ ingressId: 'ingress' }) })
  })

  describe.each([true, false])('and the stored streaming flag is %s', (streaming) => {
    beforeEach(() => {
      manager.isStreaming.mockResolvedValue(streaming)
    })

    it('should record the start without trusting the possibly stale flag', async () => {
      await handler.handle(event)
      expect(manager.startStreaming).toHaveBeenCalledWith('ingress')
      expect(manager.isStreaming).not.toHaveBeenCalled()
    })
  })

  describe('and the ingress is missing', () => {
    beforeEach(() => {
      event.ingressInfo = undefined
    })

    it('should leave streaming state unchanged', async () => {
      await handler.handle(event)
      expect(manager.startStreaming).not.toHaveBeenCalled()
    })
  })

  describe('and recording the start fails', () => {
    beforeEach(() => {
      manager.startStreaming.mockRejectedValueOnce(new Error('database unavailable'))
    })

    it('should propagate the error so delivery can be retried', async () => {
      await expect(handler.handle(event)).rejects.toThrow('database unavailable')
    })
  })
})
