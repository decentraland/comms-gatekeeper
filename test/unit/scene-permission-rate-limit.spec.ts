import { createScenePermissionRateLimit } from '../../src/controllers/middlewares/scene-permission-rate-limit'
import { createConfigMockedComponent } from '../mocks/config-mock'

describe('when scene permission requests are rate limited', () => {
  let middleware: Awaited<ReturnType<typeof createScenePermissionRateLimit>>
  let context: Parameters<typeof middleware>[0]
  let next: jest.Mock

  beforeEach(async () => {
    jest.useFakeTimers()
    middleware = await createScenePermissionRateLimit({
      config: createConfigMockedComponent({
        getNumber: jest.fn().mockImplementation(async (key) => (key === 'SCENE_PERMISSION_REQUEST_LIMIT' ? 2 : 1000))
      })
    })
    context = { verification: { auth: '0xabc' } } as Parameters<typeof middleware>[0]
    next = jest.fn().mockResolvedValue({ status: 200 })
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('should reject unsigned requests without starting permission work', async () => {
    context.verification = undefined
    expect(await middleware(context, next)).toEqual({ status: 401, body: { error: 'Authentication required' } })
    expect(next).not.toHaveBeenCalled()
  })

  describe('and the wallet quota has been consumed', () => {
    beforeEach(async () => {
      await middleware(context, next)
      await middleware(context, next)
      next.mockClear()
    })
    it('should return 429 and Retry-After before doing more work', async () => {
      expect(await middleware(context, next)).toEqual({
        status: 429,
        headers: { 'Retry-After': '1' },
        body: { error: 'Too many scene permission requests' }
      })
      expect(next).not.toHaveBeenCalled()
    })
    it('should share the quota across wallet casing', async () => {
      context.verification.auth = '0xABC'
      expect((await middleware(context, next)).status).toBe(429)
    })
    it('should keep different wallets independent', async () => {
      context.verification.auth = '0xdef'
      expect((await middleware(context, next)).status).toBe(200)
    })
    it('should allow the wallet again after the window expires', async () => {
      jest.advanceTimersByTime(1001)
      expect((await middleware(context, next)).status).toBe(200)
    })
  })
})
