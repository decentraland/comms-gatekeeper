import { positiveIntegerOr, positiveNumberOr } from '../../../src/utils/config'

describe('positiveNumberOr', () => {
  describe('when the value is a positive number', () => {
    it('should return it', () => {
      expect(positiveNumberOr(500, 1000)).toBe(500)
    })
  })

  describe('when the value is a positive fraction', () => {
    it('should return it', () => {
      expect(positiveNumberOr(0.5, 1000)).toBe(0.5)
    })
  })

  describe('when the value is undefined', () => {
    it('should return the fallback', () => {
      expect(positiveNumberOr(undefined, 1000)).toBe(1000)
    })
  })

  describe('when the value is zero', () => {
    it('should return the fallback, since lru-cache reads 0 as unbounded rather than rejecting it', () => {
      expect(positiveNumberOr(0, 1000)).toBe(1000)
    })
  })

  describe('when the value is negative', () => {
    it('should return the fallback', () => {
      expect(positiveNumberOr(-1, 1000)).toBe(1000)
    })
  })

  describe('when the value is not finite', () => {
    it('should return the fallback, since a lifetime or a bound of Infinity is no bound at all', () => {
      expect(positiveNumberOr(Infinity, 1000)).toBe(1000)
      expect(positiveNumberOr(NaN, 1000)).toBe(1000)
    })
  })
})

describe('positiveIntegerOr', () => {
  describe('when the value is a positive integer', () => {
    it('should return it', () => {
      expect(positiveIntegerOr(16, 64)).toBe(16)
    })
  })

  describe('when the value is undefined', () => {
    it('should return the fallback', () => {
      expect(positiveIntegerOr(undefined, 64)).toBe(64)
    })
  })

  describe('when the value is zero or negative', () => {
    it('should return the fallback', () => {
      expect(positiveIntegerOr(0, 64)).toBe(64)
      expect(positiveIntegerOr(-3, 64)).toBe(64)
    })
  })

  describe('when the value is a fraction', () => {
    it('should return the fallback, since a count cannot be fractional', () => {
      expect(positiveIntegerOr(2.5, 64)).toBe(64)
    })
  })

  describe('when the value is not finite', () => {
    it('should return the fallback', () => {
      expect(positiveIntegerOr(Infinity, 64)).toBe(64)
      expect(positiveIntegerOr(NaN, 64)).toBe(64)
    })
  })
})
