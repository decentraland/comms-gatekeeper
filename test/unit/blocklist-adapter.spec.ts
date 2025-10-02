import { IConfigComponent, ILoggerComponent, Response } from '@well-known-components/interfaces'
import { createDenyListComponent, IDenyListComponent } from '../../src/adapters/denylist'
import { ICachedFetchComponent } from '../../src/types/fetch.type'
import { createCachedFetchMockedComponent } from '../mocks/cached-fetch'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

let denyList: IDenyListComponent
let config: IConfigComponent
let cachedFetch: ICachedFetchComponent
let fetchMock: jest.MockedFunction<ReturnType<ICachedFetchComponent['cache']>['fetch']>
let logs: ILoggerComponent

beforeEach(async () => {
  fetchMock = jest.fn()
  config = {
    requireString: jest.fn().mockResolvedValue('https://example.com/denylist.json'),
    getString: jest.fn(),
    getNumber: jest.fn(),
    requireNumber: jest.fn()
  }
  cachedFetch = createCachedFetchMockedComponent({ fetch: fetchMock })
  logs = createLoggerMockedComponent()
  denyList = await createDenyListComponent({ config, cachedFetch, logs })
})

describe('when checking if a wallet is denylisted', () => {
  describe('and fetching the denylist fails', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(undefined)
    })

    it('should resolve to false', async () => {
      await expect(denyList.isDenylisted('0x123')).resolves.toBe(false)
    })
  })

  describe('and the wallet is not in the denylist', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({ users: [] })
    })

    it('should resolve to false', async () => {
      const isDenylisted = await denyList.isDenylisted('0x123')
      expect(isDenylisted).toBe(false)
    })
  })

  describe('and the wallet is in the denylist', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce({ users: [{ wallet: '0x123' }] })
    })

    it('should resolve to true', async () => {
      const isDenylisted = await denyList.isDenylisted('0x123')
      expect(isDenylisted).toBe(true)
    })
  })
})
