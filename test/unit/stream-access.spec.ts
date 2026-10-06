import { removeReplacedIngress } from '../../src/logic/stream-access'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { ILivekitComponent } from '../../src/types/livekit.type'

describe('when cleaning up a replaced stream access', () => {
  let livekit: jest.Mocked<Pick<ILivekitComponent, 'removeIngress'>>
  let logger: ILoggerComponent.ILogger
  let replaced: { place_id: string; ingress_id: string }

  beforeEach(() => {
    livekit = { removeIngress: jest.fn().mockResolvedValue(undefined) }
    logger = createLoggerMockedComponent().getLogger('test')
    replaced = { place_id: 'place', ingress_id: 'old-ingress' }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should remove the old ingress when its replacement differs', async () => {
    await removeReplacedIngress(livekit, logger, replaced, 'new-ingress')
    expect(livekit.removeIngress).toHaveBeenCalledWith('old-ingress')
  })

  describe('and the existing row has no ingress', () => {
    beforeEach(() => {
      replaced.ingress_id = ''
    })

    it('should leave ingresses untouched', async () => {
      await removeReplacedIngress(livekit, logger, replaced, 'new-ingress')
      expect(livekit.removeIngress).not.toHaveBeenCalled()
    })
  })

  describe('and the replacement reuses the ingress', () => {
    it('should keep the ingress', async () => {
      await removeReplacedIngress(livekit, logger, replaced, 'old-ingress')
      expect(livekit.removeIngress).not.toHaveBeenCalled()
    })
  })

  describe('and the replacement has no ingress', () => {
    it('should remove the old ingress', async () => {
      await removeReplacedIngress(livekit, logger, replaced, undefined)
      expect(livekit.removeIngress).toHaveBeenCalledWith('old-ingress')
    })
  })

  describe('and LiveKit rejects cleanup', () => {
    beforeEach(() => {
      livekit.removeIngress.mockRejectedValueOnce(new Error('unavailable'))
    })

    it('should log the failure without rejecting the persisted replacement', async () => {
      await expect(removeReplacedIngress(livekit, logger, replaced, 'new-ingress')).resolves.toBeUndefined()
      expect(logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ ingressId: 'old-ingress' })
      )
    })
  })
})
