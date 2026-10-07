import { FOUR_DAYS, getStreamAccessExpirationTime } from '../../src/logic/time'

describe('when calculating stream-access expiration', () => {
  it('should parse Postgres bigint strings', () => {
    expect(getStreamAccessExpirationTime({ created_at: '1000', expiration_time: '2000' })).toBe(2000)
  })

  it('should use the legacy four-day deadline for a null expiration', () => {
    expect(getStreamAccessExpirationTime({ created_at: '1000', expiration_time: null })).toBe(1000 + FOUR_DAYS)
  })

  it('should preserve a stored zero deadline rather than treating it as absent', () => {
    expect(getStreamAccessExpirationTime({ created_at: '1000', expiration_time: 0 })).toBe(0)
  })
})
