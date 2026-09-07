import { IBaseComponent, START_COMPONENT } from '@well-known-components/interfaces'
import {
  createWorldRoomPrefixCheckComponent,
  IWorldRoomPrefixCheckComponent
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

/** The worlds content server's `/status`, with the per-world detail this check reads. */
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

/** The same information as `/live-data` reports it. */
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
      fetch: jest.fn().mockResolvedValue(statusResponse(['cozyfarm.dcl.eth', 'other.dcl.eth']))
    })
    metrics = createMetricsMockedComponent({})
    livekit = createLivekitMockedComponent({
      getWorldRoomName: jest.fn().mockImplementation((worldName: string) => `world-${worldName.toLowerCase()}`)
    })
  })

  describe('when every reported world round-trips through the prefix', () => {
    beforeEach(async () => {
      await build()
    })

    it('should read the worlds content server status once', async () => {
      await component.check()

      expect(fetchComponent.fetch).toHaveBeenCalledWith(`${WORLD_CONTENT_URL}/status`)
      expect(fetchComponent.fetch).toHaveBeenCalledTimes(1)
    })

    it('should report no mismatch', async () => {
      await expect(component.check()).resolves.toBe(true)

      expect(metrics.observe).toHaveBeenCalledWith('presence_prefix_mismatch', {}, 0)
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should accept a world name the server reports in mixed case', async () => {
      fetchComponent.fetch.mockResolvedValue(statusResponse(['CozyFarm.DCL.eth']))

      await expect(component.check()).resolves.toBe(true)
    })
  })

  describe('when this service builds a room name the prefix cannot be stripped from', () => {
    beforeEach(async () => {
      livekit.getWorldRoomName.mockImplementation((worldName: string) => `world-env-${worldName.toLowerCase()}`)
      await build()
    })

    it('should raise the mismatch gauge instead of silently answering with empty rooms forever', async () => {
      await expect(component.check()).resolves.toBe(false)

      expect(metrics.observe).toHaveBeenCalledWith('presence_prefix_mismatch', {}, 1)
      expect(logger.error).toHaveBeenCalled()
    })
  })

  describe('when the round trip does not recover the world name', () => {
    beforeEach(async () => {
      livekit.getWorldRoomName.mockImplementation((worldName: string) => `world-${worldName.toLowerCase()}-suffixed`)
      await build()
    })

    it('should raise the mismatch gauge', async () => {
      await expect(component.check()).resolves.toBe(false)

      expect(metrics.observe).toHaveBeenCalledWith('presence_prefix_mismatch', {}, 1)
    })
  })

  describe('when /status carries no per-world detail', () => {
    beforeEach(async () => {
      fetchComponent.fetch
        .mockResolvedValueOnce(statusResponse([]))
        .mockResolvedValueOnce(liveDataResponse(['cozyfarm.dcl.eth']))
      await build()
    })

    it('should fall back to /live-data, which is where the detail is published', async () => {
      await expect(component.check()).resolves.toBe(true)

      expect(fetchComponent.fetch).toHaveBeenNthCalledWith(1, `${WORLD_CONTENT_URL}/status`)
      expect(fetchComponent.fetch).toHaveBeenNthCalledWith(2, `${WORLD_CONTENT_URL}/live-data`)
    })
  })

  describe('when no world has anyone in it', () => {
    beforeEach(async () => {
      fetchComponent.fetch.mockResolvedValue(statusResponse([]))
      await build()
    })

    it('should report no mismatch, because there was nothing to disagree about', async () => {
      await expect(component.check()).resolves.toBe(true)

      expect(metrics.observe).toHaveBeenCalledWith('presence_prefix_mismatch', {}, 0)
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('when the worlds content server cannot be reached', () => {
    beforeEach(async () => {
      fetchComponent.fetch.mockRejectedValue(new Error('worlds content server is down'))
      await build()
    })

    it('should not claim a mismatch it could not observe', async () => {
      await expect(component.check()).resolves.toBe(true)

      expect(metrics.observe).not.toHaveBeenCalledWith('presence_prefix_mismatch', {}, 1)
      expect(logger.warn).toHaveBeenCalled()
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
      fetchComponent.fetch.mockImplementation(() => {
        throw new Error('DNS exploded')
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
    })
  })
})
