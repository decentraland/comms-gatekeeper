import { resolveWorldSceneId } from '../../src/logic/world-scene'
import { AppComponents } from '../../src/types'
import { InvalidRequestError } from '../../src/types/errors'

describe('when resolving a world scene ID', () => {
  let worlds: jest.Mocked<Pick<AppComponents['worlds'], 'fetchWorldSceneId'>>

  beforeEach(() => {
    worlds = { fetchWorldSceneId: jest.fn() }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should normalize an uppercase content ID without a lookup', async () => {
    expect(await resolveWorldSceneId(worlds, 'name.eth', 'BAFKREISCENE')).toBe('bafkreiscene')
    expect(worlds.fetchWorldSceneId).not.toHaveBeenCalled()
  })

  describe('and the caller supplies an uppercase legacy world name', () => {
    beforeEach(() => {
      worlds.fetchWorldSceneId.mockResolvedValueOnce('BAFKREISCENE')
    })

    it('should resolve and normalize the content ID', async () => {
      expect(await resolveWorldSceneId(worlds, 'name.eth', 'NAME.ETH')).toBe('bafkreiscene')
    })
  })

  describe('and the world lookup fails', () => {
    beforeEach(() => {
      worlds.fetchWorldSceneId.mockRejectedValueOnce(new Error('unavailable'))
    })

    it('should reject the request with a domain error', async () => {
      await expect(resolveWorldSceneId(worlds, 'name.eth', 'name.eth')).rejects.toThrow(InvalidRequestError)
    })
  })
})
