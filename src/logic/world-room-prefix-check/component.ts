import { START_COMPONENT } from '@well-known-components/interfaces'
import { AppComponents } from '../../types'
import { getErrorMessage } from '../errors'
import { IWorldRoomPrefixCheckComponent } from './types'

/** Where the worlds content server publishes its per-world comms detail. */
const LIVE_DATA_PATH = '/live-data'
/** Where the same detail is published when its handler fills `comms.details` in. */
const STATUS_PATH = '/status'

/**
 * How many live worlds the check asks LiveKit about.
 *
 * The question is "does *any* of the rooms we compute exist", which a sample answers as well as
 * the whole list, and the whole list is unbounded — a busy deployment has hundreds of live
 * worlds and this runs on the startup path.
 */
export const MAX_WORLDS_CHECKED = 25

/**
 * How many live worlds must be sampled before "none of their rooms exists" is read as a prefix
 * disagreement.
 *
 * A live world can legitimately have no LiveKit room — `/live-data` lists a world by name and not
 * by occupancy, so a world with nobody actually connected is reported as live, and a deployment
 * on a comms adapter that is not LiveKit has no rooms at all. On one or two such worlds the
 * observation says nothing, and an error naming a `COMMS_ROOM_PREFIX` that is in fact correct
 * pages someone for the wrong outage. Three independent roomless worlds is where the coincidence
 * stops being cheaper than the misconfiguration.
 */
export const MIN_WORLDS_FOR_MISMATCH = 3

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
 * It is decisive because it asks LiveKit, not the content server: the content server publishes
 * world names already stripped of *its* prefix, so round-tripping one through *our* prefix
 * succeeds by construction and can never observe the disagreement. Instead the check takes the
 * worlds the content server reports as live, computes each expected room name with
 * `getWorldRoomName`, and asks LiveKit which of those rooms exist. Worlds are live, so their
 * rooms exist — unless we are computing the wrong names. "None of them exists" is only read that
 * way from `MIN_WORLDS_FOR_MISMATCH` sampled worlds up, because a single live world can be
 * legitimately roomless.
 *
 * On failure it logs an error and raises the `presence_prefix_mismatch` gauge; it never throws
 * and never gates startup, because a misconfigured world path is not a reason to refuse to serve
 * everything else. This is a one-off diagnostic use of LiveKit's room listing on boot, not a
 * presence read.
 *
 * @param components - The config, logs, metrics, fetch and livekit components.
 * @param options - `checkOnStart` decides whether the lifecycle hook runs the check. The test
 * environment passes `false`, the same way the cron jobs are held back there: booting a test
 * program must not reach out to a live worlds content server or to LiveKit.
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

  function namesOf(worlds: ReportedWorld[] | undefined): string[] {
    return (worlds ?? [])
      .map((world) => world.worldName)
      .filter((worldName): worldName is string => typeof worldName === 'string' && worldName.length > 0)
  }

  /**
   * The worlds the content server reports as live.
   *
   * `/live-data` is the source: it publishes the per-world detail as `data.perWorld`. `/status`
   * carries the same list as `comms.details`, but its handler blanks it out in some
   * configurations, so it is only the fallback. Either source is fine — only the world names are
   * used.
   */
  async function liveWorldNames(): Promise<string[]> {
    const liveData = await readJson(LIVE_DATA_PATH)
    const fromLiveData = namesOf(liveData?.data?.perWorld ?? liveData?.perWorld)
    if (fromLiveData.length > 0) {
      return fromLiveData
    }

    const status = await readJson(STATUS_PATH)
    return namesOf(status?.comms?.details)
  }

  async function check(): Promise<boolean> {
    let names: string[]

    try {
      names = await liveWorldNames()
    } catch (error) {
      // Not a mismatch: an unreachable content server proves nothing about the prefixes, and
      // claiming one would page someone for the wrong outage.
      logger.warn(`Could not read the live worlds from the worlds content server: ${getErrorMessage(error)}`)
      metrics.observe('presence_prefix_mismatch', {}, 0)
      return true
    }

    if (names.length === 0) {
      logger.info('No live worlds to check the world room prefix against; skipping the check')
      metrics.observe('presence_prefix_mismatch', {}, 0)
      return true
    }

    const sample = names.slice(0, MAX_WORLDS_CHECKED)
    const expectedRooms = sample.map((worldName) => livekit.getWorldRoomName(worldName))

    let existing: Set<string>

    try {
      const rooms = await livekit.listRooms(expectedRooms)
      existing = new Set(rooms.map((room) => room.name.toLowerCase()))
    } catch (error) {
      // Same reasoning: an empty answer from a LiveKit that cannot be reached is not evidence
      // that the rooms do not exist.
      logger.warn(`Could not ask LiveKit which world rooms exist: ${getErrorMessage(error)}`)
      metrics.observe('presence_prefix_mismatch', {}, 0)
      return true
    }

    const found = expectedRooms.filter((roomName) => existing.has(roomName.toLowerCase()))

    if (found.length === 0 && sample.length < MIN_WORLDS_FOR_MISMATCH) {
      // Not enough evidence to name a culprit: see `MIN_WORLDS_FOR_MISMATCH`. Logged so the
      // observation is not lost, with the gauge left at 0 — the same way every other "nothing
      // conclusive was observed" branch above leaves it.
      logger.info(
        `None of the ${expectedRooms.length} LiveKit rooms computed for the live worlds exists ` +
          `(e.g. world "${sample[0]}" -> room "${expectedRooms[0]}"), but a mismatch is only reported ` +
          `from ${MIN_WORLDS_FOR_MISMATCH} sampled live worlds up: a world listed as live with nobody ` +
          'connected, or a deployment on a comms adapter that is not LiveKit, has no room either. ' +
          `COMMS_ROOM_PREFIX is "${prefix}".`
      )
      metrics.observe('presence_prefix_mismatch', {}, 0)
      return true
    }

    if (found.length === 0) {
      metrics.observe('presence_prefix_mismatch', {}, 1)
      logger.error(
        `None of the ${expectedRooms.length} LiveKit rooms this service computes for the live worlds exists ` +
          `(e.g. world "${sample[0]}" -> room "${expectedRooms[0]}"). COMMS_ROOM_PREFIX ("${prefix}") most likely ` +
          "disagrees with the worlds content server's, so every world participant lookup will answer with an " +
          'empty room until the two match.'
      )
      return false
    }

    logger.info(
      `World room prefix "${prefix}" resolves ${found.length} of ${expectedRooms.length} live world rooms in LiveKit`
    )
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
