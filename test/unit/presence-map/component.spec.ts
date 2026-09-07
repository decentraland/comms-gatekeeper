import { ParcelChangesBatch } from '@dcl/protocol/out-js/decentraland/pulse/pulse_presence.gen'
import { IBaseComponent, ILoggerComponent, START_COMPONENT } from '@well-known-components/interfaces'
import { NatsMessageHandler } from '../../../src/adapters/nats'
import { createPresenceMapComponent, IPresenceMapComponent } from '../../../src/logic/presence-map'
import { createConfigMockedComponent } from '../../mocks/config-mock'
import { createFetchMockedComponent } from '../../mocks/fetch-mock'
import { createLoggerMockedComponent } from '../../mocks/logger-mock'
import { createMetricsMockedComponent } from '../../mocks/metrics-mock'
import { createNatsMockedComponent } from '../../mocks/nats-mock'
import { flushMacrotask } from '../../utils'
import {
  decodeParcelChangesFixture,
  expectedBatchFromJson,
  listParcelChangeFixtures,
  readFixtureBytes,
  readFixtureJson
} from '../../fixtures/iteration-2/loader'

type ExpectedEntry = { realm: string; parcel: [number, number] }

const PEERS_ALL = readFixtureJson<{
  body: { peers: Array<{ address: string; parcel: [number, number]; realm: string }> }
}>('http/peers-all.json')

const REPLAY = readFixtureJson<{
  steps: Array<{ apply: string; map: Record<string, ExpectedEntry>; frozen: string[] }>
}>('parcel_changes/replay.json')

const W1 = '0x0000000000000000000000000000000000000001'
const W2 = '0x0000000000000000000000000000000000000002'
const W3 = '0x0000000000000000000000000000000000000003'
const W4 = '0x0000000000000000000000000000000000000004'
const W5 = '0x0000000000000000000000000000000000000005'
const W7 = '0x0000000000000000000000000000000000000007'
const W9 = '0x0000000000000000000000000000000000000009'

const startOptions: IBaseComponent.ComponentStartOptions = {
  started: () => true,
  live: () => true,
  getComponents: () => ({})
}

function encodeBatch(batch: Partial<ParcelChangesBatch>): Uint8Array {
  return ParcelChangesBatch.encode({
    serverName: '',
    seq: 0,
    snapshot: false,
    serverTime: 0,
    changes: [],
    ...batch
  } as ParcelChangesBatch).finish()
}

describe('presence-map component', () => {
  let component: IPresenceMapComponent
  let nats: ReturnType<typeof createNatsMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let fetchComponent: ReturnType<typeof createFetchMockedComponent>
  let logger: jest.Mocked<ILoggerComponent.ILogger>

  type BuildOptions = {
    settings?: Record<string, string | undefined>
    natsEnabled?: boolean
  }

  function peersAllResponse(): any {
    return { ok: true, status: 200, json: async () => ({ ok: true, peers: PEERS_ALL.body.peers }) }
  }

  async function build({ settings = {}, natsEnabled = true }: BuildOptions = {}): Promise<IPresenceMapComponent> {
    const values: Record<string, string | undefined> = {
      PRESENCE_MAP_ENABLED: 'true',
      PULSE_URL: 'https://pulse.example.com',
      ...settings
    }
    const config = createConfigMockedComponent({
      getString: jest.fn().mockImplementation((key: string) => Promise.resolve(values[key]))
    })

    nats = createNatsMockedComponent({ isEnabled: jest.fn().mockReturnValue(natsEnabled) })
    metrics = createMetricsMockedComponent({})
    fetchComponent = createFetchMockedComponent({ fetch: jest.fn().mockResolvedValue(peersAllResponse()) })
    const logs = createLoggerMockedComponent({})

    component = await createPresenceMapComponent({ config, logs, metrics, nats, fetch: fetchComponent })
    logger = logs.getLogger.mock.results[0].value

    return component
  }

  async function start(): Promise<void> {
    await (component as IBaseComponent)[START_COMPONENT]!(startOptions)
    // The prime is deliberately not awaited by start(), so let it settle before asserting.
    await flushMacrotask()
  }

  function subscribedHandler(): NatsMessageHandler {
    return nats.subscribe.mock.calls[0][1]
  }

  function apply(binName: string): void {
    component.applyBatch(decodeParcelChangesFixture(binName))
  }

  function expectMapToEqual(expected: Record<string, ExpectedEntry>): void {
    expect(component.size()).toBe(Object.keys(expected).length)
    for (const [address, expectedEntry] of Object.entries(expected)) {
      const entry = component.get(address)
      expect(entry).toBeDefined()
      expect({ realm: entry!.realm, parcel: entry!.parcel }).toEqual(expectedEntry)
    }
  }

  describe('when decoding the contract fixtures', () => {
    it.each(listParcelChangeFixtures())('should decode %s into the object its .json pins', (binName) => {
      expect(decodeParcelChangesFixture(binName)).toEqual(expectedBatchFromJson(binName))
    })

    it('should decode an empty parcel as present at the world origin, not as a departure', () => {
      const snapshot = decodeParcelChangesFixture('01-snapshot.bin')

      expect(snapshot.changes.find((change) => change.address === W3)?.parcel).toEqual({ x: 0, y: 0 })
    })

    it('should decode a parcel-absent change as a departure', () => {
      expect(decodeParcelChangesFixture('03-exit.bin').changes[0].parcel).toBeUndefined()
    })
  })

  describe('when replaying the contract scenario', () => {
    beforeEach(async () => {
      await build({ settings: { PULSE_URL: undefined } })
    })

    it.each(REPLAY.steps.map((step, index) => [index, step.apply] as const))(
      'should hold the pinned map after step %i (%s)',
      (index) => {
        for (let step = 0; step <= index; step++) {
          apply(REPLAY.steps[step].apply)
        }

        expectMapToEqual(REPLAY.steps[index].map)
      }
    )
  })

  describe('when a sequence gap arrives', () => {
    beforeEach(async () => {
      await build({ settings: { PULSE_URL: undefined } })
      apply('01-snapshot.bin')
      apply('02-delta-move.bin')
    })

    it('should keep serving the pre-gap state instead of dropping the map', () => {
      apply('08-gap.bin')

      expect(component.size()).toBe(5)
      expect(component.get(W5)).toMatchObject({ realm: 'main', parcel: [147, -3] })
      expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_presence_gaps_total')
    })

    it('should ignore later in-sequence deltas from the frozen server until a snapshot arrives', () => {
      apply('08-gap.bin')

      component.applyBatch(
        ParcelChangesBatch.decode(
          encodeBatch({
            serverName: 'pulse-1',
            seq: 10,
            changes: [{ address: W4, realm: 'main', parcel: { x: 9, y: 9 } }]
          })
        )
      )

      expect(component.get(W4)).toMatchObject({ parcel: [-1, 0] })
    })

    it('should resume applying deltas once the frozen server sends a snapshot', () => {
      apply('08-gap.bin')
      apply('10-snapshot-restart.bin')

      component.applyBatch(
        ParcelChangesBatch.decode(
          encodeBatch({
            serverName: 'pulse-1',
            seq: 2,
            changes: [{ address: W4, realm: 'main', parcel: { x: 9, y: 9 } }]
          })
        )
      )

      expect(component.get(W4)).toMatchObject({ parcel: [9, 9] })
    })

    it('should freeze a server whose first batch is a delta rather than a snapshot', () => {
      component.applyBatch(
        ParcelChangesBatch.decode(
          encodeBatch({
            serverName: 'pulse-9',
            seq: 4,
            changes: [{ address: W9, realm: 'main', parcel: { x: 1, y: 1 } }]
          })
        )
      )

      expect(component.get(W9)).toBeUndefined()
    })

    it('should ignore a replayed batch without freezing the server', () => {
      apply('02-delta-move.bin')
      apply('03-exit.bin')

      expect(component.get(W1)).toBeUndefined()
      expect(metrics.increment).not.toHaveBeenCalledWith('dcl_gatekeeper_presence_gaps_total')
    })
  })

  describe('when a snapshot arrives', () => {
    beforeEach(async () => {
      await build({ settings: { PULSE_URL: undefined } })
      apply('01-snapshot.bin')
      apply('09-second-server.bin')
    })

    it('should replace only the entries owned by the snapshotting server', () => {
      apply('10-snapshot-restart.bin')

      expect(component.get(W7)).toMatchObject({ realm: 'main' })
      expect(component.get(W3)).toBeUndefined()
      expect(component.get(W2)).toMatchObject({ realm: 'cozyfarm.dcl.eth', parcel: [1, 2] })
    })
  })

  describe('when a departure arrives from a server that does not own the entry', () => {
    beforeEach(async () => {
      await build({ settings: { PULSE_URL: undefined } })
      apply('01-snapshot.bin')
      apply('09-second-server.bin')
    })

    it('should keep the entry, because the owning server is authoritative for it', () => {
      component.applyBatch(
        ParcelChangesBatch.decode(
          encodeBatch({ serverName: 'pulse-2', seq: 2, changes: [{ address: W1, realm: 'main' }] })
        )
      )

      expect(component.get(W1)).toMatchObject({ realm: 'main', parcel: [-1, 0] })
    })
  })

  describe('when a non-lowercase realm arrives on the wire', () => {
    beforeEach(async () => {
      await build({ settings: { PULSE_URL: undefined } })
      apply('01-snapshot.bin')
      apply('02-delta-move.bin')
      apply('03-exit.bin')
      apply('04-realm-change.bin')
      apply('05-coalesced.bin')
      apply('06-mixed-case.bin')
    })

    it('should count the contract violation, keep the map and store the value lowercased', () => {
      const sizeBefore = component.size()

      apply('07-invalid-mixed-case-realm.bin')

      expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_presence_contract_violations_total')
      expect(component.size()).toBe(sizeBefore + 1)
      expect(component.get(W1)).toMatchObject({ realm: 'main' })
      expect(component.getAddressesInRealm('main')).toContain(W1)
    })

    it('should never log the address of the offending change', () => {
      apply('07-invalid-mixed-case-realm.bin')

      for (const call of logger.warn.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(W1)
      }
    })
  })

  describe('when looking peers up', () => {
    beforeEach(async () => {
      await build({ settings: { PULSE_URL: undefined } })
      apply('01-snapshot.bin')
    })

    it('should match realms case-insensitively', () => {
      expect(component.getAddressesInRealm('CozyFarm.dcl.eth')).toEqual([W3])
    })

    it('should return the addresses of a realm sorted ascending', () => {
      expect(component.getAddressesInRealm('main')).toEqual([W1, W2, W4, W5])
    })

    it('should return only the addresses standing on the requested parcels', () => {
      expect(component.getAddressesInParcels('main', ['-1,0', '0,0', '-1,1'])).toEqual([W1, W4])
    })

    it('should not leak peers of another realm standing on the same parcel', () => {
      expect(component.getAddressesInParcels('main', ['0,0'])).toEqual([])
    })

    it('should count peers per parcel for a realm', () => {
      expect(component.getParcelCounts('main')).toEqual(
        expect.arrayContaining([
          { parcel: [-1, 0], peersCount: 2 },
          { parcel: [147, -3], peersCount: 2 }
        ])
      )
      expect(component.getParcelCounts('main')).toHaveLength(2)
    })

    it('should report no parcels for an unknown realm', () => {
      expect(component.getParcelCounts('nowhere.dcl.eth')).toEqual([])
    })
  })

  describe('when starting', () => {
    describe('and the presence map is enabled', () => {
      beforeEach(async () => {
        await build()
        await start()
      })

      it('should subscribe to engine.parcel_changes without a queue group', () => {
        expect(nats.subscribe).toHaveBeenCalledWith('engine.parcel_changes', expect.any(Function))
        expect(nats.subscribe.mock.calls[0][2]).toBeUndefined()
      })

      it('should connect to NATS', () => {
        expect(nats.connect).toHaveBeenCalled()
      })

      it('should prime the map from Pulse and become ready', () => {
        expect(fetchComponent.fetch).toHaveBeenCalledWith('https://pulse.example.com/peers?all=true')
        expect(component.isReady()).toBe(true)
        expect(component.size()).toBe(5)
        expect(component.getAddressesInParcels('main', ['-1,0'])).toEqual([W1, W4])
      })
    })

    describe('and the presence map is disabled', () => {
      beforeEach(async () => {
        await build({ settings: { PRESENCE_MAP_ENABLED: undefined } })
        await start()
      })

      it('should subscribe to nothing, prime nothing and stay unready', () => {
        expect(nats.subscribe).not.toHaveBeenCalled()
        expect(nats.connect).not.toHaveBeenCalled()
        expect(fetchComponent.fetch).not.toHaveBeenCalled()
        expect(component.isReady()).toBe(false)
      })
    })

    describe('and NATS is not configured', () => {
      beforeEach(async () => {
        await build({ natsEnabled: false })
        await start()
      })

      it('should stay idle rather than subscribe to a broker it has no address for', () => {
        expect(nats.subscribe).not.toHaveBeenCalled()
        expect(component.isReady()).toBe(false)
      })
    })

    describe('and PULSE_URL is not configured', () => {
      beforeEach(async () => {
        await build({ settings: { PULSE_URL: undefined } })
        await start()
      })

      it('should skip the prime and wait for the first snapshot to become ready', () => {
        expect(fetchComponent.fetch).not.toHaveBeenCalled()
        expect(component.isReady()).toBe(false)

        apply('01-snapshot.bin')

        expect(component.isReady()).toBe(true)
      })
    })

    describe('and the prime request fails', () => {
      beforeEach(async () => {
        await build()
        fetchComponent.fetch.mockRejectedValue(new Error('pulse is down'))
        await start()
      })

      it('should stay unready without crashing and recover on the first snapshot', () => {
        expect(component.isReady()).toBe(false)
        expect(component.size()).toBe(0)

        apply('01-snapshot.bin')

        expect(component.isReady()).toBe(true)
      })
    })

    describe('and a snapshot lands before the prime response comes back', () => {
      it('should discard the primed state rather than overwrite the feed with it', async () => {
        await build()
        let resolvePrime: (value: any) => void = () => undefined
        fetchComponent.fetch.mockReturnValue(
          new Promise((resolve) => {
            resolvePrime = resolve
          }) as any
        )

        await start()
        apply('10-snapshot-restart.bin')
        resolvePrime(peersAllResponse())
        await flushMacrotask()

        expect(component.size()).toBe(2)
      })
    })

    describe('and the first snapshot arrives after a successful prime', () => {
      it('should retire the primed entries the feed did not re-announce', async () => {
        await build()
        await start()
        expect(component.size()).toBe(5)

        apply('10-snapshot-restart.bin')

        expect(component.size()).toBe(2)
      })
    })
  })

  describe('when a message arrives on the subscription', () => {
    beforeEach(async () => {
      await build({ settings: { PULSE_URL: undefined } })
      await start()
    })

    it('should decode it and apply it to the map', () => {
      subscribedHandler()('engine.parcel_changes', readFixtureBytes('parcel_changes/01-snapshot.bin'))

      expect(component.size()).toBe(5)
      expect(metrics.increment).toHaveBeenCalledWith('dcl_gatekeeper_presence_batches_received_total')
    })

    it('should never throw on a malformed payload', () => {
      expect(() =>
        subscribedHandler()('engine.parcel_changes', Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff]))
      ).not.toThrow()
      expect(component.size()).toBe(0)
    })
  })
})
