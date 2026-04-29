import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { ApplicationName, IFeaturesComponent } from '@well-known-components/features-component'
import { createFeatureFlagsAdapter, FeatureFlag, IFeatureFlagsAdapter } from '../../src/adapters/feature-flags'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

type StartableComponent = IFeatureFlagsAdapter & {
  [START_COMPONENT]: () => Promise<void>
  [STOP_COMPONENT]: () => Promise<void>
}

describe('feature-flags adapter', () => {
  let adapter: StartableComponent
  let mockGetIsFeatureEnabled: jest.Mock
  let mockGetFeatureVariant: jest.Mock
  let mockFeatures: jest.Mocked<IFeaturesComponent>

  beforeEach(async () => {
    mockGetIsFeatureEnabled = jest.fn()
    mockGetFeatureVariant = jest.fn()

    mockFeatures = {
      getEnvFeature: jest.fn(),
      getIsFeatureEnabled: mockGetIsFeatureEnabled,
      getFeatureVariant: mockGetFeatureVariant
    }

    adapter = (await createFeatureFlagsAdapter({
      config: createConfigMockedComponent({
        getNumber: jest.fn().mockResolvedValue(undefined)
      }),
      features: mockFeatures,
      logs: createLoggerMockedComponent()
    })) as StartableComponent
  })

  afterEach(async () => {
    await adapter[STOP_COMPONENT]()
  })

  describe('before the component has been started', () => {
    describe('and isEnabled is queried', () => {
      it('should return false', () => {
        expect(adapter.isEnabled(FeatureFlag.PLATFORM_USER_MODERATORS)).toBe(false)
      })
    })

    describe('and getVariants is queried', () => {
      let result: string[] | undefined

      beforeEach(async () => {
        result = await adapter.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)
      })

      it('should return undefined', () => {
        expect(result).toBeUndefined()
      })

      it('should not hit the upstream features service', () => {
        expect(mockGetFeatureVariant).not.toHaveBeenCalled()
      })
    })
  })

  describe('after the component has been started', () => {
    describe('and the upstream returns an enabled flag with a variant payload', () => {
      beforeEach(async () => {
        mockGetIsFeatureEnabled.mockResolvedValue(true)
        mockGetFeatureVariant.mockResolvedValue({
          name: 'allowlist',
          enabled: true,
          payload: {
            type: 'string',
            value: '0xAaa, 0xBBB\n,0xccc'
          }
        })

        await adapter[START_COMPONENT]()
      })

      it('should query the platform user moderators flag for the dapps app', () => {
        expect(mockGetIsFeatureEnabled).toHaveBeenCalledWith(
          ApplicationName.DAPPS,
          FeatureFlag.PLATFORM_USER_MODERATORS
        )
        expect(mockGetFeatureVariant).toHaveBeenCalledWith(ApplicationName.DAPPS, FeatureFlag.PLATFORM_USER_MODERATORS)
      })

      it('should reflect the cached enabled flag in isEnabled', () => {
        expect(adapter.isEnabled(FeatureFlag.PLATFORM_USER_MODERATORS)).toBe(true)
      })

      it('should return the parsed variant payload from getVariants', async () => {
        const result = await adapter.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)
        expect(result).toEqual(['0xaaa', '0xbbb', '0xccc'])
      })

      describe('and getVariants is called multiple times', () => {
        beforeEach(async () => {
          mockGetFeatureVariant.mockClear()
          await adapter.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)
          await adapter.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)
        })

        it('should not hit the upstream features service again', () => {
          expect(mockGetFeatureVariant).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the upstream returns the flag disabled with no variant', () => {
      beforeEach(async () => {
        mockGetIsFeatureEnabled.mockResolvedValue(false)
        mockGetFeatureVariant.mockResolvedValue(null)

        await adapter[START_COMPONENT]()
      })

      it('should reflect the disabled flag in isEnabled', () => {
        expect(adapter.isEnabled(FeatureFlag.PLATFORM_USER_MODERATORS)).toBe(false)
      })

      it('should return undefined from getVariants', async () => {
        const result = await adapter.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)
        expect(result).toBeUndefined()
      })
    })

    describe('and the variant payload contains multiple newlines between values', () => {
      beforeEach(async () => {
        mockGetIsFeatureEnabled.mockResolvedValue(true)
        mockGetFeatureVariant.mockResolvedValue({
          name: 'allowlist',
          enabled: true,
          payload: {
            type: 'string',
            value: '0xAaa,\n0xBBB,\n0xccc'
          }
        })

        await adapter[START_COMPONENT]()
      })

      it('should strip every newline before splitting', async () => {
        const result = await adapter.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)
        expect(result).toEqual(['0xaaa', '0xbbb', '0xccc'])
      })
    })

    describe('and the variant payload has an empty value', () => {
      beforeEach(async () => {
        mockGetIsFeatureEnabled.mockResolvedValue(true)
        mockGetFeatureVariant.mockResolvedValue({
          name: 'allowlist',
          enabled: true,
          payload: { type: 'string', value: '' }
        })

        await adapter[START_COMPONENT]()
      })

      it('should return undefined from getVariants', async () => {
        const result = await adapter.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)
        expect(result).toBeUndefined()
      })
    })

    describe('and the upstream refresh fails', () => {
      beforeEach(async () => {
        mockGetIsFeatureEnabled.mockRejectedValue(new Error('upstream down'))
        mockGetFeatureVariant.mockRejectedValue(new Error('upstream down'))

        await adapter[START_COMPONENT]()
      })

      it('should swallow the error and leave isEnabled at the default false', () => {
        expect(adapter.isEnabled(FeatureFlag.PLATFORM_USER_MODERATORS)).toBe(false)
      })

      it('should swallow the error and leave getVariants at undefined', async () => {
        const result = await adapter.getVariants<string[]>(FeatureFlag.PLATFORM_USER_MODERATORS)
        expect(result).toBeUndefined()
      })
    })
  })
})
