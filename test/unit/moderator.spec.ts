import { IConfigComponent } from '@well-known-components/interfaces'
import { createModeratorComponent } from '../../src/logic/moderator/component'
import { IModeratorComponent } from '../../src/logic/moderator/types'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

describe('moderator-component', () => {
  let mockLogs: any
  let mockConfig: jest.Mocked<IConfigComponent>

  beforeEach(() => {
    mockLogs = createLoggerMockedComponent()
    mockConfig = {
      getString: jest.fn(),
      getNumber: jest.fn(),
      requireString: jest.fn(),
      requireNumber: jest.fn()
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function createMockContext(auth?: string) {
    return {
      verification: auth !== undefined ? { auth } : undefined
    } as any
  }

  describe('when an allowlisted address makes a request', () => {
    let component: IModeratorComponent
    let moderatorAddress: string
    let next: jest.Mock

    beforeEach(async () => {
      moderatorAddress = '0x1234567890abcdef1234567890abcdef12345678'
      mockConfig.getString.mockResolvedValue(moderatorAddress)
      component = await createModeratorComponent({ config: mockConfig, logs: mockLogs })
      next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
    })

    it('should call next() and return its response', async () => {
      const result = await component.moderatorAuthMiddleware(createMockContext(moderatorAddress), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200, body: { ok: true } })
    })
  })

  describe('when a non-allowlisted address makes a request', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      mockConfig.getString.mockResolvedValue('0x1234567890abcdef1234567890abcdef12345678')
      component = await createModeratorComponent({ config: mockConfig, logs: mockLogs })
      next = jest.fn()
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(
        createMockContext('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when the address has different casing', () => {
    describe('and the allowlist uses lowercase but the request uses uppercase', () => {
      let component: IModeratorComponent
      let next: jest.Mock

      beforeEach(async () => {
        mockConfig.getString.mockResolvedValue('0x1234567890abcdef1234567890abcdef12345678')
        component = await createModeratorComponent({ config: mockConfig, logs: mockLogs })
        next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
      })

      it('should pass the request through', async () => {
        const result = await component.moderatorAuthMiddleware(
          createMockContext('0x1234567890ABCDEF1234567890ABCDEF12345678'),
          next
        )

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200, body: { ok: true } })
      })
    })

    describe('and the allowlist uses uppercase but the request uses lowercase', () => {
      let component: IModeratorComponent
      let next: jest.Mock

      beforeEach(async () => {
        mockConfig.getString.mockResolvedValue('0x1234567890ABCDEF1234567890ABCDEF12345678')
        component = await createModeratorComponent({ config: mockConfig, logs: mockLogs })
        next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
      })

      it('should pass the request through', async () => {
        const result = await component.moderatorAuthMiddleware(
          createMockContext('0x1234567890abcdef1234567890abcdef12345678'),
          next
        )

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200, body: { ok: true } })
      })
    })
  })

  describe('when the allowlist is empty', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      mockConfig.getString.mockResolvedValue('')
      component = await createModeratorComponent({ config: mockConfig, logs: mockLogs })
      next = jest.fn()
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(
        createMockContext('0x1234567890abcdef1234567890abcdef12345678'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when the allowlist is undefined', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      mockConfig.getString.mockResolvedValue(undefined as any)
      component = await createModeratorComponent({ config: mockConfig, logs: mockLogs })
      next = jest.fn()
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(
        createMockContext('0x1234567890abcdef1234567890abcdef12345678'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when verification is undefined', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      mockConfig.getString.mockResolvedValue('0x1234567890abcdef1234567890abcdef12345678')
      component = await createModeratorComponent({ config: mockConfig, logs: mockLogs })
      next = jest.fn()
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(
        { verification: undefined } as any,
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when verification.auth is undefined', () => {
    let component: IModeratorComponent
    let next: jest.Mock

    beforeEach(async () => {
      mockConfig.getString.mockResolvedValue('0x1234567890abcdef1234567890abcdef12345678')
      component = await createModeratorComponent({ config: mockConfig, logs: mockLogs })
      next = jest.fn()
    })

    it('should respond with a 401 and the unauthorized error', async () => {
      const result = await component.moderatorAuthMiddleware(
        { verification: { auth: undefined } } as any,
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { error: 'You are not authorized to access this resource' }
      })
    })
  })

  describe('when the allowlist contains invalid addresses', () => {
    let component: IModeratorComponent
    let validAddress: string

    beforeEach(async () => {
      validAddress = '0x1234567890abcdef1234567890abcdef12345678'
      mockConfig.getString.mockResolvedValue(
        `${validAddress},not-an-address,`
      )
      component = await createModeratorComponent({ config: mockConfig, logs: mockLogs })
    })

    describe('and a valid address makes a request', () => {
      let next: jest.Mock

      beforeEach(() => {
        next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
      })

      it('should pass the request through', async () => {
        const result = await component.moderatorAuthMiddleware(createMockContext(validAddress), next)

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200, body: { ok: true } })
      })
    })
  })
})
