import { Entity, EntityType } from '@dcl/schemas'
import { createContentClientComponent } from '../../src/adapters/content-client'
import { IContentClientComponent } from '../../src/types/content-client.type'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createFetchMockedComponent } from '../mocks/fetch-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'

const fetchEntitiesByPointers = jest.fn()
const fetchEntityById = jest.fn()

jest.mock('dcl-catalyst-client', () => ({
  createContentClient: jest.fn(() => ({
    fetchEntitiesByPointers: (...args: unknown[]) => fetchEntitiesByPointers(...args),
    fetchEntityById: (...args: unknown[]) => fetchEntityById(...args)
  }))
}))

const CONTENT_URL = 'https://content.example.com/content'

function entity(id: string, pointers: string[], overrides: Partial<Entity> = {}): Entity {
  return {
    version: 'v3',
    id,
    type: EntityType.SCENE,
    pointers,
    timestamp: 0,
    content: [],
    ...overrides
  } as Entity
}

describe('content-client adapter', () => {
  let component: IContentClientComponent

  beforeEach(async () => {
    fetchEntitiesByPointers.mockReset()
    fetchEntityById.mockReset()

    component = await createContentClientComponent({
      config: createConfigMockedComponent({
        getNumber: jest.fn().mockResolvedValue(undefined),
        requireString: jest.fn().mockResolvedValue(CONTENT_URL)
      }),
      fetch: createFetchMockedComponent(),
      logs: createLoggerMockedComponent({})
    })
  })

  describe('when fetching entities by pointers', () => {
    describe('and several pointers are requested at once', () => {
      beforeEach(() => {
        fetchEntitiesByPointers.mockResolvedValue([entity('scene-a', ['10,10', '10,11']), entity('scene-b', ['20,20'])])
      })

      it('should ask the catalyst for all of them in one call and return every entity', async () => {
        const entities = await component.fetchEntitiesByPointers(['10,10', '10,11', '20,20'])

        expect(fetchEntitiesByPointers).toHaveBeenCalledTimes(1)
        expect(fetchEntitiesByPointers).toHaveBeenCalledWith(['10,10', '10,11', '20,20'])
        expect(entities.map((found) => found.id).sort()).toEqual(['scene-a', 'scene-b'])
      })

      it('should serve a later overlapping request from the cache, fetching only what is missing', async () => {
        await component.fetchEntitiesByPointers(['10,10', '10,11', '20,20'])
        fetchEntitiesByPointers.mockResolvedValue([entity('scene-c', ['30,30'])])

        const entities = await component.fetchEntitiesByPointers(['10,10', '30,30'])

        expect(fetchEntitiesByPointers).toHaveBeenLastCalledWith(['30,30'])
        expect(entities.map((found) => found.id).sort()).toEqual(['scene-a', 'scene-c'])
      })
    })

    describe('and a pointer has no scene deployed on it', () => {
      beforeEach(() => {
        fetchEntitiesByPointers.mockResolvedValue([])
      })

      it('should return nothing and remember the miss instead of re-asking', async () => {
        expect(await component.fetchEntitiesByPointers(['99,99'])).toEqual([])
        expect(await component.fetchEntitiesByPointers(['99,99'])).toEqual([])
        expect(fetchEntitiesByPointers).toHaveBeenCalledTimes(1)
      })
    })

    describe('and no pointer is requested', () => {
      it('should return nothing without calling the catalyst', async () => {
        expect(await component.fetchEntitiesByPointers([])).toEqual([])
        expect(fetchEntitiesByPointers).not.toHaveBeenCalled()
      })
    })
  })

  describe('when calculating a scene thumbnail', () => {
    describe('and the scene has no navmap thumbnail', () => {
      it('should return undefined', () => {
        expect(component.calculateThumbnail(entity('scene-a', ['0,0']))).toBeUndefined()
      })
    })

    describe('and the navmap thumbnail is an absolute URL', () => {
      it('should return it untouched', () => {
        const scene = entity('scene-a', ['0,0'], {
          metadata: { display: { navmapThumbnail: 'https://cdn.example.com/thumb.png' } }
        })

        expect(component.calculateThumbnail(scene)).toBe('https://cdn.example.com/thumb.png')
      })
    })

    describe('and the navmap thumbnail names an uploaded file', () => {
      it('should resolve it to the content URL of that file hash', () => {
        const scene = entity('scene-a', ['0,0'], {
          metadata: { display: { navmapThumbnail: 'images/thumb.png' } },
          content: [{ file: 'images/thumb.png', hash: 'bafyhash' }]
        })

        expect(component.calculateThumbnail(scene)).toBe(`${CONTENT_URL}/contents/bafyhash`)
      })
    })

    describe('and the navmap thumbnail names a file the scene did not upload', () => {
      it('should return undefined rather than an unresolvable path', () => {
        const scene = entity('scene-a', ['0,0'], {
          metadata: { display: { navmapThumbnail: 'images/missing.png' } },
          content: [{ file: 'images/thumb.png', hash: 'bafyhash' }]
        })

        expect(component.calculateThumbnail(scene)).toBeUndefined()
      })
    })
  })
})
