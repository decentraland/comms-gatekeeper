import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { snapshotEnv } from '../../utils'

/**
 * A key no `.env*` file and no deployment defines, so the assertions below are about what the
 * helper does and nothing else.
 */
const KEY = 'COMMS_GATEKEEPER_TEST_ONLY_NUMBER'

describe('snapshotEnv', () => {
  afterEach(() => {
    delete process.env[KEY]
  })

  describe('when the variable was not set', () => {
    it('should leave it unset rather than store the string "undefined"', () => {
      const restore = snapshotEnv(KEY)
      process.env[KEY] = '3600000'

      restore()

      expect(KEY in process.env).toBe(false)
    })

    it('should leave a config provider free to fall back to its own defaults', async () => {
      const restore = snapshotEnv(KEY)
      process.env[KEY] = '3600000'
      restore()

      // The failure this guards: createDotEnvConfigComponent skips a default whose key is already
      // present in process.env, so a restored "undefined" makes getNumber throw
      // `should be a number, got string (undefined)` for every program built afterwards in this
      // jest worker — a spec poisoning the ones that run after it.
      const config = await createDotEnvConfigComponent({ path: [] }, { [KEY]: '10000' })

      await expect(config.getNumber(KEY)).resolves.toBe(10000)
    })
  })

  describe('when the variable was set', () => {
    it('should put the original value back', () => {
      process.env[KEY] = 'original'
      const restore = snapshotEnv(KEY)
      process.env[KEY] = 'changed'

      restore()

      expect(process.env[KEY]).toBe('original')
    })
  })
})
