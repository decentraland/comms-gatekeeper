import { isValidPresenterIdentity } from '../../../src/controllers/handlers/cast/presenter-identity'

describe('when validating a presenter identity', () => {
  const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

  describe('and the streamer place or room id contains colons', () => {
    it('should accept the bounded identity with a trailing UUID', () => {
      expect(isValidPresenterIdentity(`stream:scene:localpreview:bafytest:${uuid}`)).toBe(true)
    })
  })

  describe('and the streamer identity exceeds the maximum length', () => {
    it('should reject it', () => {
      expect(isValidPresenterIdentity(`stream:${'x'.repeat(500)}:${uuid}`)).toBe(false)
    })
  })
})
