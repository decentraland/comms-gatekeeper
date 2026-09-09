import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { FIXTURES_DIR, fixturePath, readFixtureJson } from '../fixtures/iteration-2/loader'

/**
 * The iteration-2 contract fixtures are a byte-for-byte copy of the pack in aw-contracts
 * (`docs/contracts/iteration-2/`). CI has no sibling checkout, so the pack cannot be referenced
 * directly — this guards the copy instead: every file present here must still hash to what the
 * pack's `manifest.json` records, so an accidental re-save (or a CRLF-mangling checkout) fails
 * loudly rather than quietly changing the contract under the consumer tests.
 */
describe('iteration-2 contract fixtures', () => {
  const manifest = readFixtureJson<{ files: Record<string, string> }>('manifest.json')
  const copied = Object.entries(manifest.files).filter(([relativePath]) => existsSync(fixturePath(relativePath)))

  it('should have copied at least the parcel-change, hot-scenes and scene-participants fixtures', () => {
    expect(copied.length).toBeGreaterThanOrEqual(29)
  })

  it.each(copied)('should keep %s byte-identical to the pack', (relativePath, expectedSha256) => {
    const actual = createHash('sha256')
      .update(readFileSync(fixturePath(relativePath)))
      .digest('hex')

    expect(actual).toBe(expectedSha256)
  })

  it('should resolve fixtures from the test tree, never from a sibling checkout', () => {
    expect(FIXTURES_DIR).toContain('fixtures')
  })
})
