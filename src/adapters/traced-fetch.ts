import * as nodeFetch from 'node-fetch'
import { IFetchComponent } from '@well-known-components/interfaces'
import { AppComponents } from '../types'

export function createTracedFetchComponent(components: Pick<AppComponents, 'tracer'>): IFetchComponent {
  const { tracer } = components

  return {
    fetch: (url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit) => {
      const headers: nodeFetch.HeadersInit = { ...init?.headers }
      const traceParent = tracer.isInsideOfTraceSpan() ? tracer.getTraceChildString() : null
      if (traceParent) {
        ;(headers as { [key: string]: string }).traceparent = traceParent
        const traceState = tracer.getTraceStateString()
        if (traceState) {
          ;(headers as { [key: string]: string }).tracestate = traceState
        }
      }
      return nodeFetch.default(url, { ...init, headers })
    }
  }
}
