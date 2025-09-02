import { IConfigComponent, ILoggerComponent, Response } from '@well-known-components/interfaces'
import { createBlockListComponent, IBlockListComponent } from '../../src/adapters/blocklist'
import { ICachedFetchComponent } from '../../src/types/fetch.type'
import { createCachedFetchMockedComponent } from '../mocks/cached-fetch'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

let blockList: IBlockListComponent
let config: IConfigComponent
let cachedFetch: ICachedFetchComponent
let fetchMock: jest.MockedFunction<ReturnType<ICachedFetchComponent['cache']>['fetch']>
let logs: ILoggerComponent

beforeEach(async () => {
  fetchMock = jest.fn()
  config = {
    requireString: jest.fn().mockResolvedValue('https://example.com/blacklist.json'),
    getString: jest.fn(),
    getNumber: jest.fn(),
    requireNumber: jest.fn()
  }
  cachedFetch = createCachedFetchMockedComponent({ fetch: fetchMock })
  logs = createLoggerMockedComponent()
  blockList = await createBlockListComponent({ config, cachedFetch, logs })
})

describe('when checking if a wallet is blacklisted', () => {
  describe('and fetching the blacklist fails', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(undefined)
    })

    it('should resolve to false', async () => {
      await expect(blockList.isBlacklisted('0x123')).resolves.toBe(false)
    })
  })

  describe('and the wallet is not in the blacklist', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({ users: [] })
    })

    it('should resolve to false', async () => {
      const isBlacklisted = await blockList.isBlacklisted('0x123')
      expect(isBlacklisted).toBe(false)
    })
  })

  describe('and the wallet is in the blacklist', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({ users: [{ wallet: '0x123' }] })
    })

    it('should resolve to true', async () => {
      const isBlacklisted = await blockList.isBlacklisted('0x123')
      expect(isBlacklisted).toBe(true)
    })
  })
})
