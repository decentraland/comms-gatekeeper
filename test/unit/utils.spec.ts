import { fetchSceneAudit } from '../../src/controllers/handlers/utils'

describe('Utils', () => {
  describe('fetchSceneAudit', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
      global.fetch = jest.fn()
    })

    afterAll(() => {
      global.fetch = originalFetch
    })

    it('should fetch scene data successfully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          authChain: [
            {
              type: 'SIGNER',
              payload: '0x1234567890123456789012345678901234567890',
              signature: ''
            }
          ]
        })
      }

      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      const result = await fetchSceneAudit('https://catalyst.test', 'bafkreiabcd1234')

      expect(global.fetch).toHaveBeenCalledWith('https://catalyst.test/audit/scene/bafkreiabcd1234')
      expect(result).toHaveProperty('authChain')
      expect(result.authChain[0].payload).toBe('0x1234567890123456789012345678901234567890')
    })

    it('should throw error when fetch is not available', async () => {
      global.fetch = undefined as any

      await expect(fetchSceneAudit('https://catalyst.test', 'bafkreiabcd1234')).rejects.toThrow(
        'Fetch is not available'
      )
    })

    it('should throw error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 404
      }

      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      await expect(fetchSceneAudit('https://catalyst.test', 'bafkreiabcd1234')).rejects.toThrow(
        'Server responded with status: 404'
      )
    })

    it('should throw error when response format is invalid', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          someOtherData: true
        })
      }

      global.fetch = jest.fn().mockResolvedValue(mockResponse)

      await expect(fetchSceneAudit('https://catalyst.test', 'bafkreiabcd1234')).rejects.toThrow(
        'Invalid response format: missing authChain'
      )
    })

    it('should throw error when no response is received', async () => {
      global.fetch = jest.fn().mockResolvedValue(null)

      await expect(fetchSceneAudit('https://catalyst.test', 'bafkreiabcd1234')).rejects.toThrow(
        'No response received from server'
      )
    })
  })
})
