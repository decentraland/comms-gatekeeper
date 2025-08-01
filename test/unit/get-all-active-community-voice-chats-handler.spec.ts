import { getAllActiveCommunityVoiceChatsHandler } from '../../src/controllers/handlers/get-all-active-community-voice-chats-handler'
import { createVoiceMockedComponent } from '../mocks/voice-mock'

describe('getAllActiveCommunityVoiceChatsHandler', () => {
  let mockLogger: any
  let mockContext: any
  let mockVoice: any

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    }

    mockVoice = createVoiceMockedComponent()

    mockContext = {
      components: {
        logs: {
          getLogger: jest.fn(() => mockLogger)
        },
        voice: mockVoice
      }
    }
  })

  describe('when voice component returns active chats successfully', () => {
    beforeEach(() => {
      mockVoice.getAllActiveCommunityVoiceChats.mockResolvedValue([
        { communityId: 'community1', participantCount: 5, moderatorCount: 1 },
        { communityId: 'community2', participantCount: 3, moderatorCount: 2 }
      ])
    })

    it('should return 200 with active community voice chats data', async () => {
      const result = await getAllActiveCommunityVoiceChatsHandler(mockContext)

      expect(result).toEqual({
        status: 200,
        body: {
          data: [
            { communityId: 'community1', participantCount: 5, moderatorCount: 1 },
            { communityId: 'community2', participantCount: 3, moderatorCount: 2 }
          ],
          total: 2
        }
      })

      expect(mockVoice.getAllActiveCommunityVoiceChats).toHaveBeenCalledWith()
      expect(mockLogger.info).toHaveBeenCalledWith('Retrieved 2 active community voice chats')
    })
  })

  describe('when voice component returns empty array', () => {
    beforeEach(() => {
      mockVoice.getAllActiveCommunityVoiceChats.mockResolvedValue([])
    })

    it('should return 200 with empty data', async () => {
      const result = await getAllActiveCommunityVoiceChatsHandler(mockContext)

      expect(result).toEqual({
        status: 200,
        body: {
          data: [],
          total: 0
        }
      })

      expect(mockVoice.getAllActiveCommunityVoiceChats).toHaveBeenCalledWith()
      expect(mockLogger.info).toHaveBeenCalledWith('Retrieved 0 active community voice chats')
    })
  })

  describe('when voice component throws an error', () => {
    const errorMessage = 'Database connection failed'

    beforeEach(() => {
      mockVoice.getAllActiveCommunityVoiceChats.mockRejectedValue(new Error(errorMessage))
    })

    it('should return 500 with error message', async () => {
      const result = await getAllActiveCommunityVoiceChatsHandler(mockContext)

      expect(result).toEqual({
        status: 500,
        body: {
          error: 'Failed to get active community voice chats',
          message: errorMessage
        }
      })

      expect(mockVoice.getAllActiveCommunityVoiceChats).toHaveBeenCalledWith()
      expect(mockLogger.error).toHaveBeenCalledWith(`Failed to get active community voice chats: ${errorMessage}`)
    })
  })

  describe('when voice component throws a non-Error object', () => {
    beforeEach(() => {
      mockVoice.getAllActiveCommunityVoiceChats.mockRejectedValue('Some string error')
    })

    it('should return 500 with "Unknown error" message', async () => {
      const result = await getAllActiveCommunityVoiceChatsHandler(mockContext)

      expect(result).toEqual({
        status: 500,
        body: {
          error: 'Failed to get active community voice chats',
          message: 'Unknown error'
        }
      })

      expect(mockVoice.getAllActiveCommunityVoiceChats).toHaveBeenCalledWith()
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get active community voice chats: Unknown error')
    })
  })
})
