import { getDefaultHttpMetrics } from '@dcl/http-server'
import { validateMetricsDeclaration } from '@dcl/metrics'
import { metricDeclarations as logsMetricsDeclarations } from '@well-known-components/logger'
import { IMetricsComponent } from '@well-known-components/interfaces'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  ...logsMetricsDeclarations,
  dcl_gatekeeper_nats_connected: {
    help: '1 when the NATS connection is established, 0 otherwise',
    type: IMetricsComponent.GaugeType
  },
  dcl_gatekeeper_cluster_events_received_total: {
    help: 'Total cluster_change events received from Pulse',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_tokens_minted_total: {
    help: 'Total LiveKit tokens minted for cluster rooms',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_published_total: {
    help: 'Total island_changed messages published in response to a cluster_change',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_publish_failed_total: {
    help: 'Total island_changed publishes that failed',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_banned_skipped_total: {
    help: 'Total cluster_change events skipped because the wallet is banned or denylisted',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_batches_received_total: {
    help: 'Total engine.parcel_changes batches received from Pulse',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_snapshots_total: {
    help: 'Total engine.parcel_changes snapshot batches applied',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_gaps_total: {
    help: 'Total engine.parcel_changes sequence gaps detected; the affected server is frozen until its next snapshot',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_contract_violations_total: {
    help: 'Total engine.parcel_changes entries that broke C1 (a non-lowercase realm or address, or a missing address)',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_presence_map_size: {
    help: 'Number of wallets currently held in the presence map',
    type: IMetricsComponent.GaugeType
  },
  dcl_gatekeeper_presence_frozen_servers: {
    help: 'Number of Pulse instances whose deltas are being skipped while waiting for their next snapshot',
    type: IMetricsComponent.GaugeType
  },
  dcl_gatekeeper_presence_reclaimed_total: {
    help:
      'Total presence-map entries reclaimed because nothing stands behind them any more: a primed ' +
      'entry no publisher re-asserted within PRESENCE_PRIME_TTL_MS, or the entries of a publisher ' +
      'silent for PRESENCE_SERVER_TTL_MS',
    type: IMetricsComponent.CounterType,
    labelNames: ['reason']
  },
  // Named without the dcl_gatekeeper_ prefix on purpose: the iteration-2 contract pins these two
  // names and the rollout dashboards look for them verbatim.
  presence_shadow_diff: {
    help: 'Addresses differing between the LiveKit and presence-map answers to /scene-participants',
    type: IMetricsComponent.CounterType,
    labelNames: ['kind']
  },
  presence_shadow_compare_total: {
    help:
      'Total /scene-participants shadow comparisons that actually produced two answers to compare. ' +
      'Read presence_shadow_diff against this one: a flat compare count is a shadow that never ran, ' +
      'which is not the same fact as the two sources agreeing',
    type: IMetricsComponent.CounterType,
    labelNames: ['kind']
  },
  island_resend_total: {
    help:
      'Total island_changed messages re-sent because a peer reconnected (peer.{address}.connect), ' +
      'as opposed to because it was assigned a new cluster',
    type: IMetricsComponent.CounterType
  },
  island_resend_skipped_total: {
    help:
      'Total peer.{address}.connect events answered with nothing because no cluster could be ' +
      'established for the wallet: unknown to this replica and either not in the presence map, ' +
      'not in any island of its realm, or Pulse could not be asked. Pulse publishes the first ' +
      'assignment itself once the peer is clustered',
    type: IMetricsComponent.CounterType
  },
  presence_prefix_mismatch: {
    help:
      '1 when none of the LiveKit rooms this service computes for the worlds the content server ' +
      'reports as live exists and at least three such worlds were sampled, i.e. when ' +
      "COMMS_ROOM_PREFIX most likely disagrees with the content server's; 0 when at least one " +
      'exists, and 0 whenever nothing conclusive could be observed (no live worlds, fewer than ' +
      'three sampled, an unreachable content server or LiveKit)',
    type: IMetricsComponent.GaugeType
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
