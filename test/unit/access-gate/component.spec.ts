import { ILoggerComponent } from '@well-known-components/interfaces'
import { createAccessGateComponent, IAccessGateComponent } from '../../../src/logic/access-gate'
import { createDenyListMockedComponent } from '../../mocks/denylist-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createUserModerationMockedComponent } from '../../mocks/user-moderation-mock'

const ADDRESS = '0x1111111111111111111111111111111111111111'

describe('access-gate component', () => {
  let accessGate: IAccessGateComponent
  let userModeration: ReturnType<typeof createUserModerationMockedComponent>
  let denyList: ReturnType<typeof createDenyListMockedComponent>
  let logger: jest.Mocked<ILoggerComponent.ILogger>

  async function build(): Promise<IAccessGateComponent> {
    const logs = createLoggerMockedComponent({})
    const component = await createAccessGateComponent({ userModeration, denyList, logs })
    logger = logs.getLogger.mock.results[0].value

    return component
  }

  beforeEach(() => {
    userModeration = createUserModerationMockedComponent()
    denyList = createDenyListMockedComponent()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when neither gate rejects the identity', () => {
    beforeEach(async () => {
      accessGate = await build()
    })

    it('should report both gates as clear', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS, deviceId: 'device-1' })).resolves.toEqual({
        isBanned: false,
        isDenylisted: false
      })
    })

    it('should widen the ban lookup with the supplied device id', async () => {
      await accessGate.getAccessState({ address: ADDRESS, deviceId: 'device-1' })

      expect(userModeration.getActiveBanForConnection).toHaveBeenCalledWith({ address: ADDRESS, deviceId: 'device-1' })
    })

    it('should run both lookups instead of short-circuiting on the first', async () => {
      await accessGate.getAccessState({ address: ADDRESS, deviceId: 'device-1' })

      expect(denyList.isDenylisted).toHaveBeenCalledWith(ADDRESS)
    })
  })

  describe('when the identity is platform banned', () => {
    beforeEach(async () => {
      userModeration.getActiveBanForConnection.mockResolvedValue({ isBanned: true })
      accessGate = await build()
    })

    it('should report the ban without applying any precedence of its own', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS })).resolves.toEqual({
        isBanned: true,
        isDenylisted: false
      })
    })
  })

  describe('when the identity is deny-listed', () => {
    beforeEach(async () => {
      denyList.isDenylisted.mockResolvedValue(true)
      accessGate = await build()
    })

    it('should report the deny list without applying any precedence of its own', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS })).resolves.toEqual({
        isBanned: false,
        isDenylisted: true
      })
    })
  })

  describe('when the ban lookup fails', () => {
    beforeEach(() => {
      userModeration.getActiveBanForConnection.mockRejectedValue(new Error('ban store unavailable'))
    })

    describe('and the caller did not ask to fail open', () => {
      beforeEach(async () => {
        accessGate = await build()
      })

      it('should propagate the error', async () => {
        await expect(accessGate.getAccessState({ address: ADDRESS })).rejects.toThrow('ban store unavailable')
      })
    })

    describe('and the caller asked to fail open', () => {
      beforeEach(async () => {
        accessGate = await build()
      })

      it('should report the identity as not banned', async () => {
        await expect(
          accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true })
        ).resolves.toEqual({ isBanned: false, isDenylisted: false })
      })

      it('should log the swallowed failure', async () => {
        await accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true })

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Error checking platform ban status`))
      })

      describe('and the identity is also deny-listed', () => {
        beforeEach(async () => {
          denyList.isDenylisted.mockResolvedValue(true)
          accessGate = await build()
        })

        it('should still enforce the deny list, which a shared catch would have discarded', async () => {
          await expect(
            accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true })
          ).resolves.toEqual({ isBanned: false, isDenylisted: true })
        })
      })
    })
  })

  describe('when the deny list lookup fails', () => {
    beforeEach(async () => {
      denyList.isDenylisted.mockRejectedValue(new Error('deny list unavailable'))
      accessGate = await build()
    })

    it('should propagate the error even when the ban lookup is set to fail open', async () => {
      await expect(accessGate.getAccessState({ address: ADDRESS }, { failOpenOnBanLookupError: true })).rejects.toThrow(
        'deny list unavailable'
      )
    })
  })
})
