import { START_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents } from '../../types'
import { getErrorMessage } from '../errors'
import { IWorldRoomPrefixCheckComponent } from './types'

/** Where the worlds content server publishes its per-world comms detail. */
const STATUS_PATH = '/status'
/** Where the same detail is published when `/status` omits it. */
const LIVE_DATA_PATH = '/live-data'

type ReportedWorld = { worldName?: string; users?: number }

/**
 * Creates the startup check that this service and the worlds content server agree on how a
 * world's LiveKit room is named.
 *
 * The two build the same room name from two independently configured prefixes
 * (`COMMS_ROOM_PREFIX` on both sides). When they drift apart nothing fails: the room name this
 * service computes simply does not exist, so `getRoomInfo` returns nothing and every world
 * lookup answers "nobody is here" — for the process's whole life, with no error anywhere. That
 * is the failure this check converts into a signal.
 *
 * It reads the worlds the content server says have people in them and asserts each one
 * round-trips: `getWorldRoomName(worldName)` must start with this service's prefix, and stripping
 * that prefix must give the world name back. On failure it logs an error and raises the
 * `presence_prefix_mismatch` gauge; it never throws and never gates startup, because a
 * misconfigured world path is not a reason to refuse to serve everything else.
 *
 * @param components - The config, logs, metrics, fetch and livekit components.
 * @param options - `checkOnStart` decides whether the lifecycle hook runs the check. The test
 * environment passes `false`, the same way the cron jobs are held back there: booting a test
 * program must not reach out to a live worlds content server.
 * @returns The prefix check component.
 */
export async function createWorldRoomPrefixCheckComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'metrics' | 'fetch' | 'livekit'>,
  options: { checkOnStart?: boolean } = {}
): Promise<IWorldRoomPrefixCheckComponent> {
  const { config, logs, metrics, fetch, livekit } = components
  const logger = logs.getLogger('world-room-prefix-check')

  const [worldContentUrlSetting, prefix] = await Promise.all([
    config.requireString('WORLD_CONTENT_URL'),
    config.requireString('COMMS_ROOM_PREFIX')
  ])

  const worldContentUrl = worldContentUrlSetting.replace(/\/+$/, '')
  const checkOnStart = options.checkOnStart ?? true

  async function readJson(path: string): Promise<any | undefined> {
    const response = await fetch.fetch(`${worldContentUrl}${path}`)
    if (!response.ok) {
      logger.warn(`The worlds content server answered HTTP ${response.status} on ${path}`)
      return undefined
    }
    return response.json()
  }

  /**
   * The worlds the content server reports as occupied.
   *
   * `/status` is the documented place, but its handler blanks `comms.details` out, so
   * `/live-data` — which publishes the same list as `data.perWorld` — is read when `/status`
   * carries nothing. Either source is fine: only the world names are used.
   */
  async function reportedWorlds(): Promise<ReportedWorld[] | undefined> {
    const status = await readJson(STATUS_PATH)
    const fromStatus: ReportedWorld[] = status?.comms?.details ?? []
    if (fromStatus.length > 0) {
      return fromStatus
    }

    const liveData = await readJson(LIVE_DATA_PATH)
    const fromLiveData: ReportedWorld[] = liveData?.data?.perWorld ?? []
    if (fromLiveData.length > 0) {
      return fromLiveData
    }

    return []
  }

  function roundTrips(worldName: string): boolean {
    const roomName = livekit.getWorldRoomName(worldName)

    if (!roomName.startsWith(prefix)) {
      return false
    }

    // Case-insensitive on purpose: the room name is lower-cased by both services on the way in,
    // and the content server reports whatever case the world was deployed under.
    return roomName.substring(prefix.length).toLowerCase() === worldName.toLowerCase()
  }

  async function check(): Promise<boolean> {
    let worlds: ReportedWorld[] | undefined

    try {
      worlds = await reportedWorlds()
    } catch (error) {
      // Not a mismatch: an unreachable content server proves nothing about the prefixes, and
      // claiming one would page someone for the wrong outage.
      logger.warn(`Could not check the world room prefix against the worlds content server: ${getErrorMessage(error)}`)
      return true
    }

    const names = (worlds ?? [])
      .map((world) => world.worldName)
      .filter((worldName): worldName is string => typeof worldName === 'string' && worldName.length > 0)

    if (names.length === 0) {
      logger.info('No occupied world rooms to check the world room prefix against')
      metrics.observe('presence_prefix_mismatch', {}, 0)
      return true
    }

    const mismatched = names.filter((worldName) => !roundTrips(worldName))

    if (mismatched.length > 0) {
      metrics.observe('presence_prefix_mismatch', {}, 1)
      logger.error(
        `COMMS_ROOM_PREFIX ("${prefix}") does not round-trip for ${mismatched.length} of ${names.length} world ` +
          `rooms the worlds content server reports (e.g. "${mismatched[0]}" -> ` +
          `"${livekit.getWorldRoomName(mismatched[0])}"). World participant lookups will answer with empty ` +
          'rooms until the two services agree on the prefix.'
      )
      return false
    }

    logger.info(`World room prefix "${prefix}" round-trips for all ${names.length} reported world rooms`)
    metrics.observe('presence_prefix_mismatch', {}, 0)
    return true
  }

  async function start(): Promise<void> {
    if (!checkOnStart) {
      return
    }
    // Not awaited: the worlds content server being slow must not hold HTTP readiness, and
    // nothing in this service waits on the answer — the gauge and the log line are the output.
    void check()
  }

  return {
    check,
    [START_COMPONENT]: start
  }
}
