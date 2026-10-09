import { connect } from 'nats'
import { RoomRecoveryBootstrapCompleted } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'

type BootstrapOptions = {
  pulseUrl: string
  epoch?: string
  execute: boolean
  oldIslandsReset: boolean
  removalsSettled: boolean
}

type RecoveryStatus = {
  epoch: string
  bootstrapRequired: boolean
  pendingOperations: number
  retainedWallets: number
}

type BootstrapDependencies = {
  readStatus: (pulseUrl: string) => Promise<RecoveryStatus>
  publish: (epoch: string) => Promise<void>
  wait: () => Promise<void>
}

type BootstrapResult = {
  action: 'dry-run' | 'already-confirmed' | 'confirmed'
  status: RecoveryStatus
}

const MAX_OBSERVATIONS = 6

/** Parse a manual operator command; reading status is the default. */
export function parseBootstrapOptions(args: string[]): BootstrapOptions {
  const options: BootstrapOptions = {
    pulseUrl: '',
    execute: false,
    oldIslandsReset: false,
    removalsSettled: false
  }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    switch (argument) {
      case '--pulse-url':
      case '--epoch': {
        const value = args[++index]
        if (!value || value.startsWith('--')) throw new Error('A flag is missing its value.')
        if (argument === '--pulse-url') options.pulseUrl = value
        else options.epoch = value
        break
      }
      case '--execute':
        options.execute = true
        break
      case '--confirm-old-islands-reset':
        options.oldIslandsReset = true
        break
      case '--confirm-no-outstanding-removals':
        options.removalsSettled = true
        break
      default:
        throw new Error('Unknown flag. Use --help for the operator command.')
    }
  }
  let url: URL
  try {
    url = new URL(options.pulseUrl)
  } catch {
    throw new Error('--pulse-url must name the Pulse HTTP service.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('--pulse-url must be an HTTP(S) URL without embedded credentials.')
  if (options.execute && (!options.epoch || !options.oldIslandsReset || !options.removalsSettled))
    throw new Error('Execution requires --epoch and both explicit recovery confirmations.')
  return options
}

/**
 * Confirms one observed Pulse lifetime after an operator has completed recovery.
 * This command does not reset rooms, reconcile the dispatch journal or infer that either is safe.
 */
export async function confirmRoomRecoveryBootstrap(
  options: BootstrapOptions,
  dependencies: BootstrapDependencies
): Promise<BootstrapResult> {
  const initial = await dependencies.readStatus(options.pulseUrl)
  if (options.epoch && initial.epoch !== options.epoch)
    throw new Error('Pulse epoch changed; confirmation was not sent.')
  if (!options.execute) return { action: 'dry-run', status: initial }
  if (!options.epoch || !options.oldIslandsReset || !options.removalsSettled)
    throw new Error('Explicit recovery confirmations are required before execution.')
  if (!initial.bootstrapRequired) return { action: 'already-confirmed', status: initial }

  // A failed broker flush can follow a delivered publication. Only Pulse's state confirms application.
  try {
    await dependencies.publish(options.epoch)
  } catch {
    // Observe the same epoch even when the transport outcome is unknown.
  }
  for (let attempt = 0; attempt < MAX_OBSERVATIONS; attempt++) {
    await dependencies.wait()
    let current: RecoveryStatus
    try {
      current = await dependencies.readStatus(options.pulseUrl)
    } catch {
      continue
    }
    if (current.epoch !== options.epoch) throw new Error('Pulse restarted; the new epoch remains unconfirmed.')
    if (!current.bootstrapRequired) return { action: 'confirmed', status: current }
  }
  throw new Error('Confirmation was not observed in Pulse. Read /about before deciding whether to retry.')
}

async function readStatus(pulseUrl: string): Promise<RecoveryStatus> {
  const response = await fetch(new URL('/about', pulseUrl), { signal: AbortSignal.timeout(3000) })
  if (!response.ok) throw new Error('Pulse /about is unavailable.')
  const body: unknown = await response.json()
  const status = (body as { roomRecovery?: Partial<RecoveryStatus> } | null)?.roomRecovery
  if (
    !status ||
    typeof status.epoch !== 'string' ||
    status.epoch.length === 0 ||
    typeof status.bootstrapRequired !== 'boolean' ||
    !Number.isSafeInteger(status.pendingOperations) ||
    status.pendingOperations < 0 ||
    !Number.isSafeInteger(status.retainedWallets) ||
    status.retainedWallets < 0
  )
    throw new Error('Pulse /about does not expose a valid roomRecovery status.')
  return status as RecoveryStatus
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(
      'Read status: node dist/operations/room-recovery-bootstrap.js --pulse-url http://localhost:5000\n' +
        'Confirm recovery: add --execute --epoch <observed-epoch> --confirm-old-islands-reset --confirm-no-outstanding-removals\n' +
        'NATS_URL must use operator credentials authorized to publish pulse.room_recovery.bootstrap_completed.'
    )
    return
  }
  const options = parseBootstrapOptions(process.argv.slice(2))
  if (options.execute && !process.env.NATS_URL) throw new Error('Execution requires the operator NATS_URL.')
  const result = await confirmRoomRecoveryBootstrap(options, {
    readStatus,
    async publish(epoch) {
      const connection = await connect({ servers: process.env.NATS_URL, timeout: 3000, maxReconnectAttempts: 0 })
      let flushTimeout: ReturnType<typeof setTimeout> | undefined
      try {
        connection.publish(
          'pulse.room_recovery.bootstrap_completed',
          RoomRecoveryBootstrapCompleted.encode({ epoch }).finish()
        )
        await Promise.race([
          connection.flush(),
          new Promise<never>((_, reject) => {
            flushTimeout = setTimeout(() => reject(new Error('Broker confirmation timed out.')), 3000)
          })
        ])
      } finally {
        if (flushTimeout) clearTimeout(flushTimeout)
        await connection.close()
      }
    },
    wait: () => new Promise((resolve) => setTimeout(resolve, 500))
  })
  console.log(JSON.stringify(result, null, 2))
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Bootstrap confirmation failed.')
    process.exitCode = 1
  })
}
