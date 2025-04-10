import { IConfigComponent, ILoggerComponent, IFetchComponent } from '@well-known-components/interfaces'
import { createSocialComponent } from '../../src/adapters/social'
import { ISocialComponent } from '../../src/types/social.type'

let social: ISocialComponent
let config: IConfigComponent
let logs: ILoggerComponent
let fetch: IFetchComponent
let fetchMock: jest.Mock

beforeEach(async () => {
  config = {
    getString: jest.fn(),
    requireString: jest.fn(),
    getNumber: jest.fn(),
    requireNumber: jest.fn()
  }
  logs = {
    getLogger: jest.fn().mockReturnValue({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn()
    })
  }
  fetchMock = jest.fn()
  fetch = {
    fetch: fetchMock
  }
  social = await createSocialComponent({ config, logs, fetch })
})

describe('when getting the privacy settings for a user', () => {
  describe('and the request fails due to a network error', () => {
    beforeEach(() => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))
    })

    it('should reject, propagating the error', async () => {
      await expect(social.getUserPrivacySettings('0x123')).rejects.toThrow('Network error')
    })
  })

  describe('and the request fails due to a non-200 status code', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    })

    it('should reject, propagating the error', async () => {
      await expect(social.getUserPrivacySettings('0x123')).rejects.toThrow(
        'Failed to fetch privacy settings for 0x123.'
      )
    })
  })

  describe('and the request succeeds', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ private_messages_privacy: 'all' })
      } as Response)
    })

    it('should return the privacy settings for a user', async () => {
      const privacySettings = await social.getUserPrivacySettings('0x123')
      expect(privacySettings).toEqual({ private_messages_privacy: 'all' })
    })
  })
})
