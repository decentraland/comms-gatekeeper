import { getDefaultHttpMetrics } from '@dcl/http-server'
import { validateMetricsDeclaration } from '@dcl/metrics'
import { metricDeclarations as logsMetricsDeclarations } from '@well-known-components/logger'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  ...logsMetricsDeclarations
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
