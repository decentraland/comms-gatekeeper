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
    help: 'Total island_changed messages published',
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
  // Named without the dcl_gatekeeper_ prefix on purpose: the iteration-2 contract pins this name
  // and the rollout dashboards look for it verbatim.
  presence_shadow_diff: {
    help: 'Addresses differing between the LiveKit and presence-map answers to /scene-participants',
    type: IMetricsComponent.CounterType,
    labelNames: ['kind']
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
