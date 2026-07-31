import { positiveNumberOr } from '../../../src/utils/config'

describe('positiveNumberOr', () => {
  describe('when the value is a positive number', () => {
    it('should return it', () => {
      expect(positiveNumberOr(500, 1000)).toBe(500)
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
})
