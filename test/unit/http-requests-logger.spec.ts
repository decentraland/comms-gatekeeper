import { ILoggerComponent } from '@well-known-components/interfaces'
import { instrumentHttpServerWithRequestLogger } from '../../src/logic/http-requests-logger'

describe('when instrumenting the http server with the request logger', () => {
  let inLoggerInfo: jest.Mock
  let outLoggerInfo: jest.Mock
  let logger: ILoggerComponent
  let middleware: (ctx: any, next: () => Promise<any>) => Promise<any>

  beforeEach(() => {
    inLoggerInfo = jest.fn()
    outLoggerInfo = jest.fn()
    logger = {
      getLogger: jest.fn((name: string) => ({
        debug: jest.fn(),
        info: name === 'http-in' ? inLoggerInfo : outLoggerInfo,
        warn: jest.fn(),
        error: jest.fn(),
        log: jest.fn()
      }))
    } as unknown as ILoggerComponent

    let registered: (ctx: any, next: () => Promise<any>) => Promise<any> = async () => ({})
    const server = {
      use: jest.fn((handler: typeof registered) => {
        registered = handler
      })
    } as any
    instrumentHttpServerWithRequestLogger({ server, logger })
    middleware = registered
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and a request is handled successfully', () => {
    let context: any
    let next: jest.Mock

    beforeEach(() => {
      context = { request: { method: 'POST' }, url: { pathname: '/scene-bans', search: '', hash: '' } }
      next = jest.fn().mockResolvedValue({ status: 201 })
    })

    it('should log the incoming request label', async () => {
      await middleware(context, next)
      expect(inLoggerInfo).toHaveBeenCalledWith('[POST: /scene-bans]')
    })

    it('should log the outgoing request label with the response status', async () => {
      await middleware(context, next)
      expect(outLoggerInfo).toHaveBeenCalledWith('[POST: /scene-bans][201]')
    })

    it('should return the handler response unchanged', async () => {
      const result = await middleware(context, next)
      expect(result).toEqual({ status: 201 })
    })
  })

  describe('and the request url contains a query string', () => {
    let context: any
    let next: jest.Mock

    beforeEach(() => {
      context = { request: { method: 'GET' }, url: { pathname: '/scene-bans', search: '?address=0x1', hash: '' } }
      next = jest.fn().mockResolvedValue({ status: 200 })
    })

    it('should include the query string in the logged label', async () => {
      await middleware(context, next)
      expect(inLoggerInfo).toHaveBeenCalledWith('[GET: /scene-bans?address=0x1]')
    })
  })

  describe('and the response has no explicit status', () => {
    let context: any
    let next: jest.Mock

    beforeEach(() => {
      context = { request: { method: 'GET' }, url: { pathname: '/status', search: '', hash: '' } }
      next = jest.fn().mockResolvedValue({})
    })

    it('should log the outgoing status as 200', async () => {
      await middleware(context, next)
      expect(outLoggerInfo).toHaveBeenCalledWith('[GET: /status][200]')
    })
  })

  describe('and the handler throws an error with a status', () => {
    let context: any
    let next: jest.Mock

    beforeEach(() => {
      context = { request: { method: 'POST' }, url: { pathname: '/scene-bans', search: '', hash: '' } }
      next = jest.fn().mockRejectedValue({ status: 400 })
    })

    it('should rethrow the error', async () => {
      await expect(middleware(context, next)).rejects.toEqual({ status: 400 })
    })

    it('should log the outgoing label with the error status', async () => {
      await expect(middleware(context, next)).rejects.toEqual({ status: 400 })
      expect(outLoggerInfo).toHaveBeenCalledWith('[POST: /scene-bans][400]')
    })
  })

  describe('and the request targets a health-check path', () => {
    let context: any
    let next: jest.Mock

    beforeEach(() => {
      context = { request: { method: 'GET' }, url: { pathname: '/health/live', search: '', hash: '' } }
      next = jest.fn().mockResolvedValue({ status: 200 })
    })

    it('should not log the incoming request', async () => {
      await middleware(context, next)
      expect(inLoggerInfo).not.toHaveBeenCalled()
    })

    it('should not log the outgoing request', async () => {
      await middleware(context, next)
      expect(outLoggerInfo).not.toHaveBeenCalled()
    })
  })
})
