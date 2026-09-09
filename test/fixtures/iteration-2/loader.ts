import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'

/**
 * Helpers over the iteration-2 contract fixture pack copied into this repo.
 *
 * The bytes are a verbatim copy of `aw-contracts/docs/contracts/iteration-2/`; `manifest.json`
 * carries the sha256 of every file and `fixtures.spec.ts` checks the copies against it, so a
 * fixture that drifts from the pack fails the suite instead of silently changing what the
 * consumer is tested against.
 */
export const FIXTURES_DIR = __dirname

export function fixturePath(relativePath: string): string {
  return join(FIXTURES_DIR, relativePath)
}

export function readFixtureBytes(relativePath: string): Buffer {
  return readFileSync(fixturePath(relativePath))
}

export function readFixtureJson<T = any>(relativePath: string): T {
  return JSON.parse(readFileSync(fixturePath(relativePath), 'utf8')) as T
}

/** Every `parcel_changes/NN-*.bin` fixture, in fixture-number order. */
export function listParcelChangeFixtures(): string[] {
  return readdirSync(join(FIXTURES_DIR, 'parcel_changes'))
    .filter((name) => name.endsWith('.bin'))
    .sort()
}

/** Decodes a `parcel_changes/NN-*.bin` fixture with the generated consumer code. */
export function decodeParcelChangesFixture(binName: string): ParcelChangesBatch {
  return ParcelChangesBatch.decode(readFixtureBytes(join('parcel_changes', binName)))
}

/**
 * The protobuf-JSON sidecar of a `.bin` fixture, expanded to the object a proto3 decoder
 * produces: the pack omits proto3 defaults (no `"snapshot": false`, no `"x": 0`), while a
 * decoded message always carries them.
 */
export function expectedBatchFromJson(binName: string): ParcelChangesBatch {
  const json = readFixtureJson<any>(join('parcel_changes', binName.replace(/\.bin$/, '.json')))

  return {
    serverName: json.serverName ?? '',
    seq: json.seq ?? 0,
    snapshot: json.snapshot ?? false,
    serverTime: json.serverTime ?? 0,
    changes: (json.changes ?? []).map((change: any) => ({
      address: change.address ?? '',
      realm: change.realm ?? '',
      // A `parcel` key that is present but empty is the world origin, (0,0); an absent key is
      // the peer leaving. The two must not collapse into one another.
      parcel: change.parcel ? { x: change.parcel.x ?? 0, y: change.parcel.y ?? 0 } : undefined
    }))
  }
}
