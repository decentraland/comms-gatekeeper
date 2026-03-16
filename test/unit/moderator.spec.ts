import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { createModeratorComponent } from '../../src/logic/moderator/component'
import { IModeratorComponent } from '../../src/logic/moderator/types'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

describe('ModeratorComponent', () => {
  let mockedLogs: jest.Mocked<ILoggerComponent>
  let mockedConfig: jest.Mocked<IConfigComponent>
  let moderator: IModeratorComponent

  function createMockContext(address?: string) {
    return {
      verification: address ? { auth: address } : undefined
    } as any
  }

  function createMockNext() {
    return jest.fn().mockResolvedValue({ status: 200, body: { ok: true } })
  }

  beforeEach(() => {
    mockedLogs = createLoggerMockedComponent()
    mockedConfig = {
      getString: jest.fn(),
      getNumber: jest.fn(),
      requireString: jest.fn(),
      requireNumber: jest.fn()
    }
  })

  describe('when moderator allowlist has valid addresses', () => {
    const moderatorAddress = '0x1234567890123456789012345678901234567890'

    beforeEach(async () => {
      mockedConfig.getString.mockResolvedValue(moderatorAddress)
      moderator = await createModeratorComponent({ config: mockedConfig, logs: mockedLogs })
    })

    it('should allow an allowlisted address', async () => {
      const next = createMockNext()
      const result = await moderator.moderatorAuthMiddleware(createMockContext(moderatorAddress), next)

      expect(next).toHaveBeenCalled()
      expect(result.status).toBe(200)
    })

    it('should reject a non-allowlisted address', async () => {
      const next = createMockNext()
      const result = await moderator.moderatorAuthMiddleware(
        createMockContext('0x0000000000000000000000000000000000000001'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result.status).toBe(401)
    })

    it('should be case-insensitive', async () => {
      const next = createMockNext()
      const result = await moderator.moderatorAuthMiddleware(
        createMockContext(moderatorAddress.toUpperCase()),
        next
      )

      expect(next).toHaveBeenCalled()
      expect(result.status).toBe(200)
    })
  })

  describe('when moderator allowlist is empty', () => {
    beforeEach(async () => {
      mockedConfig.getString.mockResolvedValue('')
      moderator = await createModeratorComponent({ config: mockedConfig, logs: mockedLogs })
    })

    it('should reject all addresses', async () => {
      const next = createMockNext()
      const result = await moderator.moderatorAuthMiddleware(
        createMockContext('0x1234567890123456789012345678901234567890'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result.status).toBe(401)
    })
  })

  describe('when moderator allowlist is undefined', () => {
    beforeEach(async () => {
      mockedConfig.getString.mockResolvedValue(undefined as any)
      moderator = await createModeratorComponent({ config: mockedConfig, logs: mockedLogs })
    })

    it('should reject all addresses', async () => {
      const next = createMockNext()
      const result = await moderator.moderatorAuthMiddleware(
        createMockContext('0x1234567890123456789012345678901234567890'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result.status).toBe(401)
    })
  })

  describe('when verification is undefined', () => {
    beforeEach(async () => {
      mockedConfig.getString.mockResolvedValue('0x1234567890123456789012345678901234567890')
      moderator = await createModeratorComponent({ config: mockedConfig, logs: mockedLogs })
    })

    it('should return 401', async () => {
      const next = createMockNext()
      const result = await moderator.moderatorAuthMiddleware(
        { verification: undefined } as any,
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result.status).toBe(401)
    })
  })

  describe('when allowlist contains invalid addresses', () => {
    beforeEach(async () => {
      mockedConfig.getString.mockResolvedValue(
        '0x1234567890123456789012345678901234567890,invalid-address,0xABCDEF1234567890ABCDEF1234567890ABCDEF12'
      )
      moderator = await createModeratorComponent({ config: mockedConfig, logs: mockedLogs })
    })

    it('should filter out invalid addresses and allow valid ones', async () => {
      const next = createMockNext()
      const result = await moderator.moderatorAuthMiddleware(
        createMockContext('0x1234567890123456789012345678901234567890'),
        next
      )

      expect(next).toHaveBeenCalled()
      expect(result.status).toBe(200)
    })

    it('should reject invalid addresses', async () => {
      const next = createMockNext()
      const result = await moderator.moderatorAuthMiddleware(
        createMockContext('invalid-address'),
        next
      )

      expect(next).not.toHaveBeenCalled()
      expect(result.status).toBe(401)
    })
  })
})
