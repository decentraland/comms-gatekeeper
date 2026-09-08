import { assertAbsoluteHttpUrl, positiveNumberOr } from '../../../src/utils/config'

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

describe('assertAbsoluteHttpUrl', () => {
  describe('when the value is an absolute http(s) URL', () => {
    it('should return it unchanged', () => {
      expect(assertAbsoluteHttpUrl('PULSE_URL', 'https://pulse.example.com')).toBe('https://pulse.example.com')
      expect(assertAbsoluteHttpUrl('PULSE_URL', 'http://pulse.example.com:3000')).toBe('http://pulse.example.com:3000')
    })
  })

  describe('when the value is the empty string', () => {
    it('should throw, because that is what a bare `KEY=` line in a shipped .env file resolves to', () => {
      // And `requireString` returns it rather than rejecting it, which is the whole reason this
      // assertion exists: presence of the key is not proof that anything configured it.
      expect(() => assertAbsoluteHttpUrl('PULSE_URL', '')).toThrow('Configuration: PULSE_URL must be an absolute')
    })
  })

  describe('when the value is a bare host', () => {
    it('should throw rather than let a URL that cannot be fetched reach the first request', () => {
      expect(() => assertAbsoluteHttpUrl('PULSE_URL', 'pulse.example.com')).toThrow(
        'Configuration: PULSE_URL must be an absolute http(s) URL'
      )
    })
  })

  describe('when the value carries some other protocol', () => {
    it('should throw', () => {
      expect(() => assertAbsoluteHttpUrl('PULSE_URL', 'nats://pulse.example.com:4222')).toThrow(
        'Configuration: PULSE_URL must be an absolute http(s) URL'
      )
    })
  })

  describe('when the value is a placeholder', () => {
    it('should name the key without ever printing the value', () => {
      expect(() => assertAbsoluteHttpUrl('PULSE_URL', '<URL>')).toThrow(
        /^Configuration: PULSE_URL must be an absolute http\(s\) URL$/
      )
    })
  })
})
