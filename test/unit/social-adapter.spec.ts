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

describe('when checking if a player is banned', () => {
  describe('and the user is banned', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { isBanned: true } })
      } as Response)
    })

    it('should return true', async () => {
      const result = await social.isPlayerBanned('0x123')
      expect(result).toBe(true)
    })
  })

  describe('and the user is not banned', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { isBanned: false } })
      } as Response)
    })

    it('should return false', async () => {
      const result = await social.isPlayerBanned('0x123')
      expect(result).toBe(false)
    })
  })

  describe('and the request fails with HTTP 500', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    })

    it('should fail open and return false', async () => {
      const result = await social.isPlayerBanned('0x123')
      expect(result).toBe(false)
    })
  })

  describe('and the request fails due to a network error', () => {
    beforeEach(() => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))
    })

    it('should fail open and return false', async () => {
      const result = await social.isPlayerBanned('0x123')
      expect(result).toBe(false)
    })
  })
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
