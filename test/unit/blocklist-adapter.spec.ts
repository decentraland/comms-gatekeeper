import { IConfigComponent, IFetchComponent, Response } from '@well-known-components/interfaces'
import { createBlockListComponent, IBlockListComponent } from '../../src/adapters/blocklist'

let blockList: IBlockListComponent
let config: IConfigComponent
let fetch: IFetchComponent
let fetchMock: jest.MockedFunction<typeof fetch.fetch>

beforeEach(async () => {
  fetchMock = jest.fn()
  config = {
    requireString: jest.fn().mockResolvedValue('https://example.com/blacklist.json'),
    getString: jest.fn(),
    getNumber: jest.fn(),
    requireNumber: jest.fn()
  }
  fetch = {
    fetch: fetchMock
  }
  blockList = await createBlockListComponent({ config, fetch })
})

describe('when checking if a wallet is blacklisted', () => {
  describe('and fetching the blacklist fails', () => {
    beforeEach(() => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))
    })

    it('should reject, propagating the error', async () => {
      await expect(blockList.isBlacklisted('0x123')).rejects.toThrow('Network error')
    })
  })

  describe('and fetching the blacklist results in a non-200 status', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    })

    it('should reject with an error saying that the deny list could not be fetched', async () => {
      await expect(blockList.isBlacklisted('0x123')).rejects.toThrow('Failed to fetch deny list, status: 404')
    })
  })

  describe('and the wallet is not in the blacklist', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ users: [] }) } as Response)
    })

    it('should resolve to false', async () => {
      const isBlacklisted = await blockList.isBlacklisted('0x123')
      expect(isBlacklisted).toBe(false)
    })
  })

  describe('and the wallet is in the blacklist', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ users: [{ wallet: '0x123' }] }) } as Response)
    })

    it('should resolve to true', async () => {
      const isBlacklisted = await blockList.isBlacklisted('0x123')
      expect(isBlacklisted).toBe(true)
    })
  })
})
