import { getHotScenesHandler } from '../../../src/controllers/handlers/hot-scenes-handler'
import { HotSceneInfo } from '../../../src/logic/hot-scenes'
import { createHotScenesMockedComponent } from '../../mocks/hot-scenes-mock'
import { createPresenceMapMockedComponent } from '../../mocks/presence-map-mock'

const RANKING: HotSceneInfo[] = [
  {
    id: 'bafy-busiest',
    name: 'busiest',
    baseCoords: [10, 10],
    usersTotalCount: 22,
    parcels: [
      [10, 10],
      [10, 11]
    ],
    thumbnail: 'https://example.com/contents/thumb',
    creator: 'creator',
    projectId: 'project-id',
    description: 'a test'
  }
]

describe('GET /hot-scenes handler', () => {
  let presenceMap: ReturnType<typeof createPresenceMapMockedComponent>
  let hotScenes: ReturnType<typeof createHotScenesMockedComponent>

  function context(): any {
    return { components: { presenceMap, hotScenes } }
  }

  beforeEach(() => {
    presenceMap = createPresenceMapMockedComponent()
    hotScenes = createHotScenesMockedComponent({ getHotScenes: jest.fn().mockReturnValue(RANKING) })
  })

  describe('when the presence map has been primed', () => {
    beforeEach(() => {
      presenceMap.isReady.mockReturnValue(true)
    })

    it('should serve the precomputed ranking as a bare array', async () => {
      const response = await getHotScenesHandler(context())

      expect(response).toEqual({ status: 200, body: RANKING })
    })

    it('should not compute anything inside the request', async () => {
      await getHotScenesHandler(context())

      expect(hotScenes.refresh).not.toHaveBeenCalled()
    })
  })

  describe('when the presence map is still warming', () => {
    beforeEach(() => {
      presenceMap.isReady.mockReturnValue(false)
    })

    it('should answer 503 warming rather than report an empty world', async () => {
      const response = await getHotScenesHandler(context())

      expect(response).toEqual({ status: 503, body: { ok: false, error: 'warming' } })
    })

    it('should not serve the ranking, however stale', async () => {
      const response = await getHotScenesHandler(context())

      expect(response.body).not.toEqual(RANKING)
    })
  })
})
