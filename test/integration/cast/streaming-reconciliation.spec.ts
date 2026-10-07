import SQL from 'sql-template-strings'
import { SceneStreamAccess, StreamingStateSnapshot } from '../../../src/types'
import { test } from '../../components'

test('Cast: Streaming State Reconciliation', function ({ components }) {
  let access: SceneStreamAccess
  let snapshot: StreamingStateSnapshot

  beforeEach(async () => {
    await components.database.query(SQL`DELETE FROM scene_stream_access WHERE place_id LIKE 'test-reconcile-%'`)
    access = await components.sceneStreamAccessManager.addAccess({
      place_id: 'test-reconcile-place',
      ingress_id: 'reconcile-ingress',
      streaming_key: 'reconcile-key',
      streaming_url: 'rtmp://example',
      expiration_time: Date.now() - 1
    })
    await components.sceneStreamAccessManager.startStreaming(access.ingress_id)
    await components.database.query(SQL`UPDATE scene_stream_access SET streaming_start_time = ${Date.now() - 180000}
      WHERE id = ${access.id}`)
  })

  afterEach(async () => {
    await components.database.query(SQL`DELETE FROM scene_stream_access WHERE place_id LIKE 'test-reconcile-%'`)
  })

  describe('when two workers select old streaming flags', () => {
    let batches: StreamingStateSnapshot[][]

    beforeEach(async () => {
      batches = await Promise.all([
        components.sceneStreamAccessManager.getStreamingAccessesToReconcile(),
        components.sceneStreamAccessManager.getStreamingAccessesToReconcile()
      ])
    })

    it('should select the access only once', () => {
      expect(batches.flat().filter((row) => row.id === access.id)).toHaveLength(1)
    })
  })

  describe('when a lookup is already in progress', () => {
    beforeEach(async () => {
      const selected = (await components.sceneStreamAccessManager.getStreamingAccessesToReconcile()).find(
        (row) => row.id === access.id
      )
      if (!selected) throw new Error('Expected the old streaming access to be selected')
      snapshot = selected
    })

    it('should wait before selecting the same access again', async () => {
      expect(await components.sceneStreamAccessManager.getStreamingAccessesToReconcile()).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: access.id })])
      )
    })

    it('should make a confirmed stopped access eligible for expiry cleanup', async () => {
      expect(await components.sceneStreamAccessManager.clearStaleStreamingState(snapshot)).toBe(true)
      expect(await components.sceneStreamAccessManager.getExpiredStreamingKeys()).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: access.id })])
      )
      expect(await components.sceneStreamAccessManager.getLatestAccessByPlaceId(access.place_id)).toEqual(
        expect.objectContaining({ streaming: false })
      )
    })

    describe('and a new started webhook arrives', () => {
      beforeEach(async () => {
        await components.sceneStreamAccessManager.startStreaming(access.ingress_id)
      })

      it('should preserve the newer streaming state', async () => {
        expect(await components.sceneStreamAccessManager.clearStaleStreamingState(snapshot)).toBe(false)
        expect(await components.sceneStreamAccessManager.isStreaming(access.ingress_id)).toBe(true)
      })
    })

    describe('and an admin resets the access', () => {
      beforeEach(async () => {
        await components.sceneStreamAccessManager.addAccess({
          place_id: access.place_id,
          ingress_id: 'replacement-ingress',
          streaming_key: 'replacement-key',
          streaming_url: 'rtmp://example',
          expiration_time: Date.now() + 60000
        })
        await components.sceneStreamAccessManager.startStreaming('replacement-ingress')
      })

      it('should preserve the replacement access', async () => {
        expect(await components.sceneStreamAccessManager.clearStaleStreamingState(snapshot)).toBe(false)
        expect(await components.sceneStreamAccessManager.isStreaming('replacement-ingress')).toBe(true)
      })
    })
  })

  describe('when a stream has just started', () => {
    beforeEach(async () => {
      await components.sceneStreamAccessManager.startStreaming(access.ingress_id)
    })

    it('should allow the ingress and webhook state time to settle', async () => {
      expect(await components.sceneStreamAccessManager.getStreamingAccessesToReconcile()).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: access.id })])
      )
    })
  })

  describe('when more than one batch of streams needs checking', () => {
    let first: StreamingStateSnapshot[]
    let second: StreamingStateSnapshot[]

    beforeEach(async () => {
      await components.database.query(SQL`
        INSERT INTO scene_stream_access (id, place_id, ingress_id, streaming_key, streaming_url,
          created_at, active, streaming, streaming_start_time)
        SELECT gen_random_uuid(), 'test-reconcile-batch-' || n, 'batch-ingress-' || n, 'batch-key-' || n,
          'rtmp://example', 0, true, true, 0 FROM generate_series(1, 100) n
      `)
      first = await components.sceneStreamAccessManager.getStreamingAccessesToReconcile()
      second = await components.sceneStreamAccessManager.getStreamingAccessesToReconcile()
    })

    it('should rotate past the first batch even if those lookups fail', () => {
      expect(first).toHaveLength(100)
      expect(second).toHaveLength(1)
      expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(101)
    })
  })
})
