import { readFileSync } from 'fs'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createPresenceMapComponent } from '../../src/logic/presence-map'
import { createFetchMockedComponent } from '../mocks/fetch-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createMetricsMockedComponent } from '../mocks/metrics-mock'
import { createNatsMockedComponent } from '../mocks/nats-mock'
import { snapshotEnv } from '../utils'

/**
 * What a program actually boots with, read through the real config component rather than a mock.
 *
 * `.env.default` ships inside the image and `src/components.ts` loads it (`['.env.default',
 * '.env']`), so it is a live config source and not documentation: whatever it defines is what an
 * operator who set nothing gets. The subtlety this file pins is that *defining a key as empty is
 * not the same as leaving it out* — `PULSE_URL=` resolves to `''`, which `getString` returns and
 * `requireString` accepts, so a key shipped that way can never be missing and can never be
 * required.
 */
const PATH = '.env.default'

/** Every `KEY=` line of the file, so the keys it folds into `process.env` can be put back after. */
function keysDefinedIn(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined)
}

describe('.env.default', () => {
  let restoreEnv: () => void

  beforeEach(() => {
    // Reading the file through the config component writes its entries into `process.env` (dotenv
    // does, and the component does it again for good measure), so this spec would otherwise
    // configure every program built after it in this jest worker.
    restoreEnv = snapshotEnv('PULSE_URL', ...keysDefinedIn(PATH))
    delete process.env.PULSE_URL
  })

  afterEach(() => {
    restoreEnv()
  })

  describe('when a program builds its config from it', () => {
    it('should leave PULSE_URL genuinely unset, so a forgotten one cannot pass a required-key check', async () => {
      const config = await createDotEnvConfigComponent({ path: [PATH] })

      await expect(config.getString('PULSE_URL')).resolves.toBeUndefined()
      await expect(config.requireString('PULSE_URL')).rejects.toThrow('Configuration: string PULSE_URL is required')
    })

    it('should still ship the two presence TTLs the contract amendments pin', async () => {
      const config = await createDotEnvConfigComponent({ path: [PATH] })

      await expect(config.getNumber('PRESENCE_PRIME_TTL_MS')).resolves.toBe(90_000)
      await expect(config.getNumber('PRESENCE_SERVER_TTL_MS')).resolves.toBe(150_000)
    })

    it('should keep the presence flags defaulting to the behaviour of the base branch', async () => {
      const config = await createDotEnvConfigComponent({ path: [PATH] })

      // Unset rather than 'false': either way the map stays off, and this is the shape rule 3 of
      // the iteration asks for — a deploy with no config change behaves like the base branch.
      await expect(config.getString('PRESENCE_MAP_ENABLED')).resolves.toBe('')
      await expect(config.getString('SHADOW_COMPARE_PRESENCE')).resolves.toBe('')
      await expect(config.getString('LIVEKIT_PRESENCE_FALLBACK')).resolves.toBe('true')
    })
  })

  /**
   * The composition, not the halves: the real config provider reading the file that ships in the
   * image, handed to the real presence-map component. A `PULSE_URL` that no deployment sets is
   * only a boot failure if these two agree about it being absent.
   */
  describe('when a program turns the presence map on without setting PULSE_URL', () => {
    async function buildPresenceMap(): Promise<unknown> {
      const config = await createDotEnvConfigComponent({ path: [PATH] })

      return createPresenceMapComponent({
        config,
        logs: createLoggerMockedComponent({}),
        metrics: createMetricsMockedComponent({}),
        nats: createNatsMockedComponent({ isEnabled: jest.fn().mockReturnValue(true) }),
        fetch: createFetchMockedComponent({})
      })
    }

    it('should refuse to build the presence map rather than boot with nothing to prime from', async () => {
      process.env.PRESENCE_MAP_ENABLED = 'true'

      await expect(buildPresenceMap()).rejects.toThrow(
        'Configuration: string PULSE_URL is required when PRESENCE_MAP_ENABLED is "true"'
      )
    })

    describe('and the map is left off, as a no-config deploy leaves it', () => {
      it('should build it anyway, because a deployment that runs without the map must not fail to boot', async () => {
        await expect(buildPresenceMap()).resolves.toBeDefined()
      })
    })
  })

  describe('when an operator looks for the key', () => {
    it('should still document PULSE_URL, commented out rather than emptied', () => {
      expect(readFileSync(PATH, 'utf8')).toContain('# PULSE_URL=')
    })
  })
})
