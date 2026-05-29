import { IHttpServerComponent } from '@well-known-components/interfaces'

// X-Forwarded-For is checked first because the service runs behind a load balancer
// that sets it. X-Real-IP is a single-IP alternative set by some proxies. The socket
// remote address is the final fallback for direct connections.
export function extractClientIp(request: IHttpServerComponent.IRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  return undefined
}
