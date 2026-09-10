import { createAssignmentMirrorComponent, IAssignmentMirrorComponent } from '../../src/adapters/assignment-mirror'
import { createConfigMockedComponent } from '../mocks/config-mock'

const WALLET = '0x1111111111111111111111111111111111111111'

describe('assignment mirror adapter', () => {
  let mirror: IAssignmentMirrorComponent

  beforeEach(async () => {
    const config = createConfigMockedComponent({
      getString: jest.fn().mockResolvedValue(undefined),
      getNumber: jest.fn().mockResolvedValue(undefined)
    })
    mirror = await createAssignmentMirrorComponent({ config })
  })

  describe('when an assignment is recorded', () => {
    beforeEach(() => {
      mirror.set(WALLET, { clusterId: 'C5', session: '0xaa' })
    })

    it('should return the cluster and the session', () => {
      expect(mirror.get(WALLET)).toEqual({ clusterId: 'C5', session: '0xaa' })
    })

    it('should count it', () => {
      expect(mirror.size()).toBe(1)
    })

    describe('and a later assignment replaces it', () => {
      beforeEach(() => {
        mirror.set(WALLET, { clusterId: 'C6', session: '0xbb' })
      })

      it('should return only the latest', () => {
        expect(mirror.get(WALLET)).toEqual({ clusterId: 'C6', session: '0xbb' })
        expect(mirror.size()).toBe(1)
      })
    })
  })

  describe('when a wallet was never recorded', () => {
    it('should return undefined', () => {
      expect(mirror.get(WALLET)).toBeUndefined()
    })
  })
})
