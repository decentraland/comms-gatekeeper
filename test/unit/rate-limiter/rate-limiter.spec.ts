import { createRateLimiterComponent } from '../../../src/logic/rate-limiter'

describe('when checking rate limits', () => {
  describe('and requests are within the limit', () => {
    it('should return null for each request', () => {
      const rateLimiter = createRateLimiterComponent()
      const checkLimit = rateLimiter.createLimiter(5, 60_000)

      for (let i = 0; i < 5; i++) {
        expect(checkLimit('127.0.0.1')).toBeNull()
      }
    })
  })

  describe('and requests exceed the limit', () => {
    it('should return a 429 response', () => {
      const rateLimiter = createRateLimiterComponent()
      const checkLimit = rateLimiter.createLimiter(3, 60_000)

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        checkLimit('127.0.0.1')
      }

      const result = checkLimit('127.0.0.1')
      expect(result).not.toBeNull()
      expect(result!.status).toBe(429)
      expect(result!.headers).toEqual({ 'Retry-After': expect.any(String) })
      expect(result!.body).toEqual({ error: 'Too many requests, please try again later' })
    })
  })

  describe('and requests come from different IPs', () => {
    it('should track limits independently per IP', () => {
      const rateLimiter = createRateLimiterComponent()
      const checkLimit = rateLimiter.createLimiter(2, 60_000)

      // Exhaust limit for IP A
      checkLimit('10.0.0.1')
      checkLimit('10.0.0.1')
      expect(checkLimit('10.0.0.1')).not.toBeNull()

      // IP B should still be allowed
      expect(checkLimit('10.0.0.2')).toBeNull()
    })
  })

  describe('and the window has expired', () => {
    it('should reset the counter', () => {
      jest.useFakeTimers()
      try {
        const rateLimiter = createRateLimiterComponent()
        const checkLimit = rateLimiter.createLimiter(2, 1000)

        // Exhaust the limit
        checkLimit('127.0.0.1')
        checkLimit('127.0.0.1')
        expect(checkLimit('127.0.0.1')).not.toBeNull()

        // Advance past the window
        jest.advanceTimersByTime(1001)

        // Should be allowed again
        expect(checkLimit('127.0.0.1')).toBeNull()
      } finally {
        jest.useRealTimers()
      }
    })
  })

  describe('and multiple limiters are created', () => {
    it('should maintain separate stores per limiter', () => {
      const rateLimiter = createRateLimiterComponent()
      const limiterA = rateLimiter.createLimiter(1, 60_000)
      const limiterB = rateLimiter.createLimiter(1, 60_000)

      // Exhaust limiter A
      limiterA('127.0.0.1')
      expect(limiterA('127.0.0.1')).not.toBeNull()

      // Limiter B should still be available
      expect(limiterB('127.0.0.1')).toBeNull()
    })
  })
})
