import { confirmRoomRecoveryBootstrap, parseBootstrapOptions } from '../../src/operations/room-recovery-bootstrap'

describe('when confirming room recovery bootstrap', () => {
  let options: ReturnType<typeof parseBootstrapOptions>
  let dependencies: jest.Mocked<Parameters<typeof confirmRoomRecoveryBootstrap>[1]>
  let pending: Awaited<ReturnType<typeof dependencies.readStatus>>
  let ready: typeof pending

  beforeEach(() => {
    options = parseBootstrapOptions([
      '--pulse-url',
      'http://localhost:5000',
      '--execute',
      '--epoch',
      'epoch-1',
      '--confirm-old-islands-reset',
      '--confirm-no-outstanding-removals'
    ])
    pending = { epoch: 'epoch-1', bootstrapRequired: true, pendingOperations: 1, retainedWallets: 1 }
    ready = { ...pending, bootstrapRequired: false }
    dependencies = { readStatus: jest.fn(), publish: jest.fn(), wait: jest.fn() }
    dependencies.readStatus.mockResolvedValueOnce(pending).mockResolvedValue(ready)
  })

  afterEach(() => jest.resetAllMocks())

  it('should confirm only after Pulse exposes completion for the expected epoch', async () => {
    await expect(confirmRoomRecoveryBootstrap(options, dependencies)).resolves.toEqual({
      action: 'confirmed',
      status: ready
    })
  })

  describe('and execution was not requested', () => {
    beforeEach(() => {
      options.execute = false
    })

    it('should leave the broker untouched', async () => {
      await confirmRoomRecoveryBootstrap(options, dependencies)
      expect(dependencies.publish).not.toHaveBeenCalled()
    })
  })

  describe('and an explicit safety confirmation is missing', () => {
    beforeEach(() => {
      options.removalsSettled = false
    })

    it('should refuse to publish', async () => {
      await expect(confirmRoomRecoveryBootstrap(options, dependencies)).rejects.toThrow(
        'Explicit recovery confirmations'
      )
      expect(dependencies.publish).not.toHaveBeenCalled()
    })
  })

  describe('and the observed epoch differs before publication', () => {
    beforeEach(() => {
      dependencies.readStatus.mockReset().mockResolvedValue({ ...pending, epoch: 'epoch-2' })
    })

    it('should reject without sending the confirmation', async () => {
      await expect(confirmRoomRecoveryBootstrap(options, dependencies)).rejects.toThrow('Pulse epoch changed')
      expect(dependencies.publish).not.toHaveBeenCalled()
    })
  })

  describe('and Pulse restarts after publication', () => {
    beforeEach(() => {
      dependencies.readStatus
        .mockReset()
        .mockResolvedValueOnce(pending)
        .mockResolvedValue({ ...ready, epoch: 'epoch-2' })
    })

    it('should refuse to confirm the new lifetime', async () => {
      await expect(confirmRoomRecoveryBootstrap(options, dependencies)).rejects.toThrow('Pulse restarted')
    })
  })

  describe('and the broker confirmation is lost', () => {
    beforeEach(() => {
      dependencies.publish.mockRejectedValueOnce(new Error('flush timed out'))
    })

    it('should use Pulse application state to establish completion', async () => {
      await expect(confirmRoomRecoveryBootstrap(options, dependencies)).resolves.toEqual({
        action: 'confirmed',
        status: ready
      })
    })
  })

  describe('and Pulse keeps reporting bootstrap pending', () => {
    beforeEach(() => {
      dependencies.readStatus.mockReset().mockResolvedValue(pending)
    })

    it('should stop after bounded observations without claiming success', async () => {
      await expect(confirmRoomRecoveryBootstrap(options, dependencies)).rejects.toThrow('Confirmation was not observed')
      expect(dependencies.publish).toHaveBeenCalledTimes(1)
      expect(dependencies.readStatus).toHaveBeenCalledTimes(7)
    })
  })

  describe('and the expected lifetime was already confirmed', () => {
    beforeEach(() => {
      dependencies.readStatus.mockReset().mockResolvedValue(ready)
    })

    it('should leave the broker untouched', async () => {
      await confirmRoomRecoveryBootstrap(options, dependencies)
      expect(dependencies.publish).not.toHaveBeenCalled()
    })
  })
})

describe('when parsing the bootstrap operator command', () => {
  describe('and execution lacks explicit recovery confirmations', () => {
    it('should refuse execution', () => {
      expect(() => parseBootstrapOptions(['--pulse-url', 'http://localhost:5000', '--execute'])).toThrow(
        'Execution requires'
      )
    })
  })

  describe('and the URL contains credentials', () => {
    it('should reject it without echoing those credentials', () => {
      expect(() => parseBootstrapOptions(['--pulse-url', 'http://user:secret@localhost:5000'])).toThrow(
        'without embedded credentials'
      )
    })
  })
})
