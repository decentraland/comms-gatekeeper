import { createModerationEpochComponent, IModerationEpochComponent } from '../../src/adapters/moderation-epoch'

describe('moderation epoch adapter', () => {
  let epoch: IModerationEpochComponent

  beforeEach(async () => {
    epoch = await createModerationEpochComponent()
  })

  describe('when nothing has been bumped', () => {
    it('should start at zero', () => {
      expect(epoch.current()).toBe(0)
    })
  })

  describe('when bumped', () => {
    let before: number

    beforeEach(() => {
      before = epoch.current()
      epoch.bump()
    })

    it('should move forward by one', () => {
      expect(epoch.current()).toBe(before + 1)
    })

    it('should keep moving forward on every bump', () => {
      epoch.bump()

      expect(epoch.current()).toBe(before + 2)
    })
  })
})
