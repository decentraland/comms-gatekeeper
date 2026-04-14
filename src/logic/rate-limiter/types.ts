import type { IBaseComponent, IHttpServerComponent } from '@well-known-components/interfaces'

/** A function that checks rate limits for a given IP, returning a 429 response or null. */
export type RateLimitCheck = (ip: string) => IHttpServerComponent.IResponse | null

/**
 * In-memory per-IP rate limiter component.
 *
 * Creates configurable rate limit checkers with sliding windows
 * and automatic cleanup of expired entries.
 */
export interface IRateLimiterComponent extends IBaseComponent {
  /**
   * Creates a rate limit checker with the given limits.
   *
   * @param maxRequests - Maximum requests allowed per window
   * @param windowMs - Window duration in milliseconds
   * @returns A function that checks rate limits per IP
   */
  createLimiter(maxRequests: number, windowMs: number): RateLimitCheck
}
