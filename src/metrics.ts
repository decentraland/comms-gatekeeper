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
  dcl_gatekeeper_cluster_snapshot_overflow_total: {
    help: 'Snapshot hints deferred to a later Pulse refresh because the recovery backlog is full',
    type: IMetricsComponent.CounterType
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
  dcl_gatekeeper_cluster_access_check_failed_total: {
    help: 'Total cluster_change events let through because the access gate lookup failed (fail-open)',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_connects_received_total: {
    help: 'Total peer connect events received from WS Connector',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_attempted_total: {
    help: 'Total resolved assignments that needed credentials because the participant was absent',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_suppressed_total: {
    help: 'Total resolved assignments skipped because LiveKit already holds the wallet',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_unresolved_total: {
    help: 'Total assignment lookups unresolved by Pulse for a change, connect or snapshot hint',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_check_failed_total: {
    help: 'Total resolved assignments skipped because the LiveKit participant lookup failed',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_takeover_evicted_total: {
    help: 'Total displaced sessions removed from their island room, with their tokens revoked, before the new session was minted',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_takeover_failed_total: {
    help: 'Total displaced sessions whose LiveKit removal failed after every retry',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_takeover_absent_total: {
    help: 'Total displaced sessions that had already left their island room when the takeover arrived; nothing was removed or revoked',
    type: IMetricsComponent.CounterType
  },
  dcl_gatekeeper_cluster_reannounce_skipped_other_session_total: {
    help: 'Total assignment lookups skipped because Pulse returned an invalid or mismatched active session',
    type: IMetricsComponent.CounterType
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
