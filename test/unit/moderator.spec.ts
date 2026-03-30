import { FeatureFlag, IFeatureFlagsAdapter } from '../../src/adapters/feature-flags'
import { createModeratorComponent } from '../../src/logic/moderator/component'
import { IModeratorComponent } from '../../src/logic/moderator/types'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

describe('moderator-component', () => {
  let mockLogs: any
  let mockFeatureFlags: jest.Mocked<IFeatureFlagsAdapter>
  let mockConfig: any

  beforeEach(() => {
    mockLogs = createLoggerMockedComponent()
    mockFeatureFlags = {
      isEnabled: jest.fn(),
      getVariants: jest.fn()
    } as any
    mockConfig = {
      getString: jest.fn().mockResolvedValue(undefined),
      requireString: jest.fn(),
      getNumber: jest.fn()
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function createMockContext(auth?: string, headers?: Record<string, string>, queryParams?: Record<string, string>) {
    const url = new URL('http://localhost/test')
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, value)
      }
    }

    return {
      verification: auth !== undefined ? { auth } : undefined,
      request: {
        headers: new Headers(headers || {})
      },
      url
    } as any
  }

  function createMockFeatureFlags(addresses: string[]): jest.Mocked<IFeatureFlagsAdapter> {
    mockFeatureFlags.getVariants.mockResolvedValue(addresses)
    return mockFeatureFlags
  }

  describe('when moderatorRequired is true', () => {
    describe('when an allowlisted address makes a request', () => {
      let component: IModeratorComponent
      let moderatorAddress: string
      let next: jest.Mock

      beforeEach(async () => {
        moderatorAddress = '0x1234567890abcdef1234567890abcdef12345678'
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags([moderatorAddress]),
          logs: mockLogs,
          config: mockConfig
        })
        next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
      })

      it('should call next() and return its response', async () => {
        const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
        const result = await middleware(createMockContext(moderatorAddress), next)

        expect(mockFeatureFlags.getVariants).toHaveBeenCalledWith(FeatureFlag.PLATFORM_USER_MODERATORS)
        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200, body: { ok: true } })
      })
    })

    describe('when a non-allowlisted address makes a request', () => {
      let component: IModeratorComponent
      let next: jest.Mock

      beforeEach(async () => {
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags(['0x1234567890abcdef1234567890abcdef12345678']),
          logs: mockLogs,
          config: mockConfig
        })
        next = jest.fn()
      })

      it('should respond with a 401 and the unauthorized error', async () => {
        const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
        const result = await middleware(
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
          component = await createModeratorComponent({
            featureFlags: createMockFeatureFlags(['0x1234567890abcdef1234567890abcdef12345678']),
            logs: mockLogs,
            config: mockConfig
          })
          next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
        })

        it('should pass the request through', async () => {
          const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
          const result = await middleware(
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
          component = await createModeratorComponent({
            featureFlags: createMockFeatureFlags(['0x1234567890ABCDEF1234567890ABCDEF12345678']),
            logs: mockLogs,
            config: mockConfig
          })
          next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
        })

        it('should pass the request through', async () => {
          const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
          const result = await middleware(
            createMockContext('0x1234567890abcdef1234567890abcdef12345678'),
            next
          )

          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200, body: { ok: true } })
        })
      })
    })

    describe('when the feature flag returns no addresses', () => {
      let component: IModeratorComponent
      let next: jest.Mock

      beforeEach(async () => {
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags([]),
          logs: mockLogs,
          config: mockConfig
        })
        next = jest.fn()
      })

      it('should respond with a 401 and the unauthorized error', async () => {
        const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
        const result = await middleware(
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

    describe('when the feature flag returns undefined', () => {
      let component: IModeratorComponent
      let next: jest.Mock

      beforeEach(async () => {
        mockFeatureFlags.getVariants.mockResolvedValue(undefined)
        component = await createModeratorComponent({
          featureFlags: mockFeatureFlags,
          logs: mockLogs,
          config: mockConfig
        })
        next = jest.fn()
      })

      it('should respond with a 401 and the unauthorized error', async () => {
        const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
        const result = await middleware(
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
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags(['0x1234567890abcdef1234567890abcdef12345678']),
          logs: mockLogs,
          config: mockConfig
        })
        next = jest.fn()
      })

      it('should respond with a 401 and the unauthorized error', async () => {
        const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
        const result = await middleware(
          createMockContext(undefined),
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
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags(['0x1234567890abcdef1234567890abcdef12345678']),
          logs: mockLogs,
          config: mockConfig
        })
        next = jest.fn()
      })

      it('should respond with a 401 and the unauthorized error', async () => {
        const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
        const context = createMockContext(undefined)
        context.verification = { auth: undefined }
        const result = await middleware(context, next)

        expect(next).not.toHaveBeenCalled()
        expect(result).toEqual({
          status: 401,
          body: { error: 'You are not authorized to access this resource' }
        })
      })
    })

    describe('when invalid addresses are in the feature flag', () => {
      let component: IModeratorComponent
      let validAddress: string

      beforeEach(async () => {
        validAddress = '0x1234567890abcdef1234567890abcdef12345678'
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags([validAddress, 'not-an-address', '']),
          logs: mockLogs,
          config: mockConfig
        })
      })

      describe('and a valid address makes a request', () => {
        let next: jest.Mock

        beforeEach(() => {
          next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
        })

        it('should pass the request through', async () => {
          const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
          const result = await middleware(createMockContext(validAddress), next)

          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200, body: { ok: true } })
        })
      })
    })
  })

  describe('when using token-based authentication', () => {
    const moderatorToken = 'test-moderator-token'

    describe('and moderatorRequired is true', () => {
      describe('and a valid token with moderator query param is provided', () => {
        let component: IModeratorComponent
        let next: jest.Mock

        beforeEach(async () => {
          mockConfig.getString.mockResolvedValue(moderatorToken)
          component = await createModeratorComponent({
            featureFlags: createMockFeatureFlags([]),
            logs: mockLogs,
            config: mockConfig
          })
          next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
        })

        it('should call next() and set verification.auth to the moderator name', async () => {
          const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
          const context = createMockContext(
            undefined,
            { authorization: `Bearer ${moderatorToken}` },
            { moderator: 'John Doe' }
          )
          const result = await middleware(context, next)

          expect(next).toHaveBeenCalled()
          expect(context.verification).toEqual({ auth: 'John Doe' })
          expect(result).toEqual({ status: 200, body: { ok: true } })
        })
      })

      describe('and a valid token with an invalid moderator name is provided', () => {
        let component: IModeratorComponent
        let next: jest.Mock

        beforeEach(async () => {
          mockConfig.getString.mockResolvedValue(moderatorToken)
          component = await createModeratorComponent({
            featureFlags: createMockFeatureFlags([]),
            logs: mockLogs,
            config: mockConfig
          })
          next = jest.fn()
        })

        it('should respond with a 400 error for names with special characters', async () => {
          const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
          const context = createMockContext(
            undefined,
            { authorization: `Bearer ${moderatorToken}` },
            { moderator: '<script>alert("xss")</script>' }
          )
          const result = await middleware(context, next)

          expect(next).not.toHaveBeenCalled()
          expect(result.status).toBe(400)
        })

        it('should respond with a 400 error for names exceeding max length', async () => {
          const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
          const context = createMockContext(
            undefined,
            { authorization: `Bearer ${moderatorToken}` },
            { moderator: 'a'.repeat(101) }
          )
          const result = await middleware(context, next)

          expect(next).not.toHaveBeenCalled()
          expect(result.status).toBe(400)
        })
      })

      describe('and a valid token without moderator query param is provided', () => {
        let component: IModeratorComponent
        let next: jest.Mock

        beforeEach(async () => {
          mockConfig.getString.mockResolvedValue(moderatorToken)
          component = await createModeratorComponent({
            featureFlags: createMockFeatureFlags([]),
            logs: mockLogs,
            config: mockConfig
          })
          next = jest.fn()
        })

        it('should respond with a 400 error', async () => {
          const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
          const context = createMockContext(
            undefined,
            { authorization: `Bearer ${moderatorToken}` }
          )
          const result = await middleware(context, next)

          expect(next).not.toHaveBeenCalled()
          expect(result).toEqual({
            status: 400,
            body: { error: 'Missing moderator query parameter' }
          })
        })
      })
    })

    describe('and moderatorRequired is false', () => {
      describe('and a valid token is provided without moderator query param', () => {
        let component: IModeratorComponent
        let next: jest.Mock

        beforeEach(async () => {
          mockConfig.getString.mockResolvedValue(moderatorToken)
          component = await createModeratorComponent({
            featureFlags: createMockFeatureFlags([]),
            logs: mockLogs,
            config: mockConfig
          })
          next = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
        })

        it('should call next() without requiring moderator query param', async () => {
          const middleware = component.moderatorAuthMiddleware({ moderatorRequired: false })
          const context = createMockContext(
            undefined,
            { authorization: `Bearer ${moderatorToken}` }
          )
          const result = await middleware(context, next)

          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200, body: { ok: true } })
        })
      })
    })

    describe('and an invalid token is provided', () => {
      let component: IModeratorComponent
      let next: jest.Mock

      beforeEach(async () => {
        mockConfig.getString.mockResolvedValue(moderatorToken)
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags([]),
          logs: mockLogs,
          config: mockConfig
        })
        next = jest.fn()
      })

      it('should fall through to wallet auth and return 401', async () => {
        const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
        const context = createMockContext(
          undefined,
          { authorization: 'Bearer wrong-token' },
          { moderator: 'John Doe' }
        )
        const result = await middleware(context, next)

        expect(next).not.toHaveBeenCalled()
        expect(result).toEqual({
          status: 401,
          body: { error: 'You are not authorized to access this resource' }
        })
      })
    })

    describe('and MODERATOR_TOKEN is not configured', () => {
      let component: IModeratorComponent
      let next: jest.Mock

      beforeEach(async () => {
        mockConfig.getString.mockResolvedValue(undefined)
        component = await createModeratorComponent({
          featureFlags: createMockFeatureFlags([]),
          logs: mockLogs,
          config: mockConfig
        })
        next = jest.fn()
      })

      it('should ignore Bearer header and fall through to wallet auth', async () => {
        const middleware = component.moderatorAuthMiddleware({ moderatorRequired: true })
        const context = createMockContext(
          undefined,
          { authorization: `Bearer ${moderatorToken}` },
          { moderator: 'John Doe' }
        )
        const result = await middleware(context, next)

        expect(next).not.toHaveBeenCalled()
        expect(result).toEqual({
          status: 401,
          body: { error: 'You are not authorized to access this resource' }
        })
      })
    })
  })
})
