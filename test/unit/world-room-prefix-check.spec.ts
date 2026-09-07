import { IBaseComponent, START_COMPONENT } from '@well-known-components/interfaces'
import { Room } from 'livekit-server-sdk'
import {
  createWorldRoomPrefixCheckComponent,
  IWorldRoomPrefixCheckComponent,
  MAX_WORLDS_CHECKED
} from '../../src/logic/world-room-prefix-check'
import { createConfigMockedComponent } from '../mocks/config-mock'
import { createFetchMockedComponent } from '../mocks/fetch-mock'
import { createLivekitMockedComponent } from '../mocks/livekit-mock'
import { createLoggerMockedComponent } from '../mocks/logger-mock'
import { createMetricsMockedComponent } from '../mocks/metrics-mock'
import { flushMacrotask } from '../utils'

const WORLD_CONTENT_URL = 'https://worlds.example.com'

const startOptions: IBaseComponent.ComponentStartOptions = {
  started: () => true,
  live: () => true,
  getComponents: () => ({})
}

/** The worlds content server's `/live-data`, which is where the per-world detail is published. */
function liveDataResponse(worldNames: string[]): any {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: { totalUsers: worldNames.length, perWorld: worldNames.map((worldName) => ({ worldName, users: 1 })) },
      lastUpdated: new Date().toISOString()
    })
  }
}

/** The same information as `/status` reports it, when its handler fills `comms.details` in. */
function statusResponse(worldNames: string[]): any {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: { commitHash: 'abc', worldsCount: { ens: 0, dcl: worldNames.length } },
      comms: {
        adapterType: 'livekit',
        rooms: worldNames.length,
        users: worldNames.length,
        details: worldNames.map((worldName) => ({ worldName, users: 1 })),
        timestamp: Date.now()
      }
    })
  }
}

/** What LiveKit answers for `listRooms(names)`: only the rooms that exist. */
function rooms(names: string[]): Room[] {
  return names.map((name) => ({ name, numParticipants: 1 })) as unknown as Room[]
}

/** Routes the mocked fetch by path, so the order the check reads the two sources in is free. */
function serve(bodies: { liveData?: string[]; status?: string[] }): jest.Mock {
  return jest.fn().mockImplementation((url: string) => {
    if (url.endsWith('/live-data')) {
      return Promise.resolve(liveDataResponse(bodies.liveData ?? []))
    }
    return Promise.resolve(statusResponse(bodies.status ?? []))
  })
}

describe('world-room prefix check', () => {
  let fetchComponent: ReturnType<typeof createFetchMockedComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let livekit: ReturnType<typeof createLivekitMockedComponent>
  let logger: any
  let component: IWorldRoomPrefixCheckComponent

  async function build(prefix = 'world-'): Promise<IWorldRoomPrefixCheckComponent> {
    const config = createConfigMockedComponent({
      requireString: jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(
            ({ WORLD_CONTENT_URL: WORLD_CONTENT_URL, COMMS_ROOM_PREFIX: prefix } as Record<string, string>)[key]
          )
        )
    })
    const logs = createLoggerMockedComponent({})

    component = await createWorldRoomPrefixCheckComponent({ config, logs, metrics, fetch: fetchComponent, livekit })
    logger = logs.getLogger.mock.results[0].value

    return component
  }

  beforeEach(() => {
    fetchComponent = createFetchMockedComponent({
      fetch: serve({ liveData: ['cozyfarm.dcl.eth', 'other.dcl.eth'] })
    })
    metrics = createMetricsMockedComponent({})
    livekit = createLivekitMockedComponent({
      getWorldRoomName: jest.fn().mockImplementation((worldName: string) => `world-${worldName.toLowerCase()}`),
      listRooms: jest.fn().mockImplementation((names?: string[]) => Promise.resolve(rooms(names ?? [])))
    })
  })

  describe('when the rooms this service computes for the live worlds exist in LiveKit', () => {
    beforeEach(async () => {
      await build()
    })

    it('should ask LiveKit about exactly the rooms it computed for the live worlds', async () => {
      await component.check()

      expect(livekit.listRooms).toHaveBeenCalledWith(['world-cozyfarm.dcl.eth', 'world-other.dcl.eth'])
    })

    it('should report no mismatch', async () => {
      await expect(component.check()).resolves.toBe(true)

      expect(metrics.observe).toHaveBeenCalledWith('presence_prefix_mismatch', {}, 0)
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should accept a world name the server reports in mixed case', async () => {
      fetchComponent.fetch.mockImplementation(() => Promise.resolve(liveDataResponse(['CozyFarm.DCL.eth'])))

      await expect(component.check()).resolves.toBe(true)

      expect(livekit.listRooms).toHaveBeenCalledWith(['world-cozyfarm.dcl.eth'])
    })

    it('should report no mismatch when only some of the rooms exist, because a live world can be roomless', async () => {
      livekit.listRooms.mockResolvedValue(rooms(['world-other.dcl.eth']))

      await expect(component.check()).resolves.toBe(true)

      expect(metrics.observe).toHaveBeenCalledWith('presence_prefix_mismatch', {}, 0)
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('when none of the computed rooms exists in LiveKit', () => {
    beforeEach(async () => {
      livekit.listRooms.mockResolvedValue([])
      await build('world-env-')
    })

    it('should raise the mismatch gauge instead of silently answering with empty rooms forever', async () => {
      await expect(component.check()).resolves.toBe(false)

      expect(metrics.observe).toHaveBeenCalledWith('presence_prefix_mismatch', {}, 1)
    })

    it('should name the configured prefix and a sample world and room, and no wallet', async () => {
      await component.check()

      expect(logger.error).toHaveBeenCalledTimes(1)
      const message = logger.error.mock.calls[0][0]
      expect(message).toContain('COMMS_ROOM_PREFIX')
      expect(message).toContain('world-env-')
      expect(message).toContain('cozyfarm.dcl.eth')
      expect(message).toContain('world-cozyfarm.dcl.eth')
      expect(message).not.toContain('0x')
    })
  })

  describe('when /live-data carries no per-world detail', () => {
    beforeEach(async () => {
      fetchComponent = createFetchMockedComponent({ fetch: serve({ status: ['cozyfarm.dcl.eth'] }) })
      await build()
    })

    it('should fall back to /status, which carries the same list when its handler fills it in', async () => {
      await expect(component.check()).resolves.toBe(true)

      expect(fetchComponent.fetch).toHaveBeenNthCalledWith(1, `${WORLD_CONTENT_URL}/live-data`)
      expect(fetchComponent.fetch).toHaveBeenNthCalledWith(2, `${WORLD_CONTENT_URL}/status`)
      expect(livekit.listRooms).toHaveBeenCalledWith(['world-cozyfarm.dcl.eth'])
    })
  })

  describe('when no world has anyone in it', () => {
    beforeEach(async () => {
      fetchComponent = createFetchMockedComponent({ fetch: serve({}) })
      await build()
    })

    it('should skip the check, because an unoccupied deployment proves nothing about the prefix', async () => {
      await expect(component.check()).resolves.toBe(true)

      expect(livekit.listRooms).not.toHaveBeenCalled()
      expect(metrics.observe).toHaveBeenCalledWith('presence_prefix_mismatch', {}, 0)
      expect(logger.info).toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should never raise the mismatch gauge, whatever else it reports', async () => {
      await component.check()

      expect(metrics.observe).not.toHaveBeenCalledWith('presence_prefix_mismatch', {}, 1)
    })
  })

  describe('when there are more live worlds than the check samples', () => {
    beforeEach(async () => {
      const names = Array.from({ length: MAX_WORLDS_CHECKED + 5 }, (_, index) => `world-${index}.dcl.eth`)
      fetchComponent = createFetchMockedComponent({ fetch: serve({ liveData: names }) })
      await build()
    })

    it('should ask LiveKit about a bounded sample of them', async () => {
      await component.check()

      expect(livekit.listRooms.mock.calls[0][0]).toHaveLength(MAX_WORLDS_CHECKED)
    })
  })

  describe('when the worlds content server cannot be reached', () => {
    beforeEach(async () => {
      fetchComponent = createFetchMockedComponent({
        fetch: jest.fn().mockRejectedValue(new Error('worlds content server is down'))
      })
      await build()
    })

    it('should not claim a mismatch it could not observe', async () => {
      await expect(component.check()).resolves.toBe(true)

      expect(metrics.observe).not.toHaveBeenCalledWith('presence_prefix_mismatch', {}, 1)
      expect(livekit.listRooms).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('when LiveKit cannot be asked which rooms exist', () => {
    beforeEach(async () => {
      livekit.listRooms.mockRejectedValue(new Error('livekit api is down'))
      await build()
    })

    it('should not claim a mismatch it could not observe', async () => {
      await expect(component.check()).resolves.toBe(true)

      expect(metrics.observe).not.toHaveBeenCalledWith('presence_prefix_mismatch', {}, 1)
      expect(logger.warn).toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('when starting', () => {
    it('should run the check without holding up startup, and never throw', async () => {
      await build()

      await expect((component as IBaseComponent)[START_COMPONENT]!(startOptions)).resolves.toBeUndefined()
      await flushMacrotask()

      expect(fetchComponent.fetch).toHaveBeenCalled()
    })

    it('should survive the check failing outright', async () => {
      fetchComponent = createFetchMockedComponent({
        fetch: jest.fn().mockImplementation(() => {
          throw new Error('DNS exploded')
        })
      })
      await build()

      await expect((component as IBaseComponent)[START_COMPONENT]!(startOptions)).resolves.toBeUndefined()
      await flushMacrotask()
    })

    it('should not reach out at all when the check is held back on start', async () => {
      const config = createConfigMockedComponent({
        requireString: jest.fn().mockResolvedValue('world-')
      })
      const held = await createWorldRoomPrefixCheckComponent(
        { config, logs: createLoggerMockedComponent({}), metrics, fetch: fetchComponent, livekit },
        { checkOnStart: false }
      )

      await (held as IBaseComponent)[START_COMPONENT]!(startOptions)
      await flushMacrotask()

      expect(fetchComponent.fetch).not.toHaveBeenCalled()
      expect(livekit.listRooms).not.toHaveBeenCalled()
    })
  })
})
