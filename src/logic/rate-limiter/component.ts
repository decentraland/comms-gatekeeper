// TODO: Migrate to the repo: https://github.com/decentraland/core-components/tree/main
import type { IRateLimiterComponent, RateLimitCheck } from './types'

interface RateLimitEntry {
  count: number
  resetAt: number
}

export function createRateLimiterComponent(): IRateLimiterComponent {
  return {
    createLimiter(maxRequests: number, windowMs: number): RateLimitCheck {
      const store = new Map<string, RateLimitEntry>()

      // Periodically clean up expired entries to prevent memory leaks
      const cleanupInterval = setInterval(() => {
        const now = Date.now()
        for (const [key, entry] of store) {
          if (now >= entry.resetAt) store.delete(key)
        }
      }, windowMs)
      cleanupInterval.unref()

      return function checkRateLimit(ip: string) {
        const now = Date.now()
        const entry = store.get(ip)

        if (!entry || now >= entry.resetAt) {
          store.set(ip, { count: 1, resetAt: now + windowMs })
          return null
        }

        entry.count++
        if (entry.count > maxRequests) {
          const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
          return {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
            body: { error: 'Too many requests, please try again later' }
          }
        }

        return null
      }
    }
  }
}
