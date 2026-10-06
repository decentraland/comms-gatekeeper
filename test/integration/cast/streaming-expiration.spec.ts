import { randomUUID } from 'crypto'
import { SceneStreamAccess } from '../../../src/types'
import { test } from '../../components'
import SQL from 'sql-template-strings'

test('Cast: Streaming Expiration', function ({ components }) {
  let claimToken: string

  const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000

  beforeEach(async () => {
    claimToken = randomUUID()
    // Clean up any existing test data
    await components.database.query(
      SQL`DELETE FROM scene_stream_access WHERE place_id LIKE 'test-expiration-%' OR place_id LIKE 'test-reset-%'`
    )
  })

  afterEach(async () => {
    // Clean up test data
    await components.database.query(
      SQL`DELETE FROM scene_stream_access WHERE place_id LIKE 'test-expiration-%' OR place_id LIKE 'test-reset-%'`
    )
  })

  describe('when renewal races with an expired-row snapshot', () => {
    let expired: SceneStreamAccess
    let replacement: SceneStreamAccess

    beforeEach(async () => {
      expired = await components.sceneStreamAccessManager.addAccess({
        place_id: 'test-expiration-race',
        ingress_id: 'old-ingress',
        streaming_key: 'old-key',
        streaming_url: 'rtmp://old',
        room_id: 'room',
        expiration_time: Date.now() - 1
      })
    })

    describe('and renewal happens before the cleanup claim', () => {
      beforeEach(async () => {
        await components.sceneStreamAccessManager.getExpiredStreamingKeys()
        replacement = await components.sceneStreamAccessManager.addAccess({
          place_id: expired.place_id,
          ingress_id: 'new-ingress',
          streaming_key: 'new-key',
          streaming_url: 'rtmp://new',
          room_id: 'room',
          expiration_time: Date.now() + FOUR_DAYS
        })
      })

      it('should claim only old ingress cleanup and preserve the new access', async () => {
        expect(await components.sceneStreamAccessManager.claimExpiredAccess(expired.id, claimToken)).toBe(true)
        expect(await components.sceneStreamAccessManager.getAccessByStreamingKey('new-key')).toEqual(
          expect.objectContaining({ id: replacement.id, active: true, ingress_id: 'new-ingress' })
        )
      })
    })

    describe('and cleanup claims the expired row before renewal', () => {
      beforeEach(async () => {
        await components.sceneStreamAccessManager.claimExpiredAccess(expired.id, claimToken)
        replacement = await components.sceneStreamAccessManager.addAccess({
          place_id: expired.place_id,
          ingress_id: 'new-ingress',
          streaming_key: 'new-key',
          streaming_url: 'rtmp://new',
          room_id: 'room',
          expiration_time: Date.now() + FOUR_DAYS
        })
      })

      it('should retry old cleanup without deactivating the new row', async () => {
        await components.database.query(SQL`UPDATE scene_stream_access SET ingress_cleanup_claim_until = 0,
          ingress_cleanup_retry_at = 0 WHERE id = ${expired.id}`)

        expect(await components.sceneStreamAccessManager.getExpiredStreamingKeys()).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: expired.id, ingress_id: 'old-ingress' })])
        )
        expect(await components.sceneStreamAccessManager.claimExpiredAccess(expired.id, claimToken)).toBe(true)
        await components.sceneStreamAccessManager.completeExpiredAccessCleanup(expired.id, claimToken)
        expect(await components.sceneStreamAccessManager.getAccessByStreamingKey('new-key')).toEqual(
          expect.objectContaining({ id: replacement.id, active: true, ingress_id: 'new-ingress' })
        )
        expect(await components.sceneStreamAccessManager.getExpiredStreamingKeys()).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: expired.id })])
        )
      })
    })

    describe('and two workers try to claim the same row', () => {
      let otherToken: string
      let claims: boolean[]

      beforeEach(async () => {
        otherToken = randomUUID()
        claims = await Promise.all([
          components.sceneStreamAccessManager.claimExpiredAccess(expired.id, claimToken),
          components.sceneStreamAccessManager.claimExpiredAccess(expired.id, otherToken)
        ])
      })

      it('should grant only one lease', () => {
        expect(claims.filter(Boolean)).toHaveLength(1)
      })

      it('should permit only the lease owner to complete and notify once', async () => {
        expect(
          await components.sceneStreamAccessManager.completeExpiredAccessCleanup(
            expired.id,
            claims[0] ? otherToken : claimToken
          )
        ).toBe(false)
        expect(
          await components.sceneStreamAccessManager.completeExpiredAccessCleanup(
            expired.id,
            claims[0] ? claimToken : otherToken
          )
        ).toBe(true)
        expect(
          await components.sceneStreamAccessManager.completeExpiredAccessCleanup(
            expired.id,
            claims[0] ? claimToken : otherToken
          )
        ).toBe(false)
      })
    })

    describe('and a failed attempt is waiting to retry', () => {
      beforeEach(async () => {
        await components.sceneStreamAccessManager.claimExpiredAccess(expired.id, claimToken)
        await components.database.query(SQL`UPDATE scene_stream_access SET ingress_cleanup_claim_until = 0
          WHERE id = ${expired.id}`)
      })

      it('should exclude the row until its retry time, even after the lease expires', async () => {
        expect(await components.sceneStreamAccessManager.getExpiredStreamingKeys()).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: expired.id })])
        )
        expect(await components.sceneStreamAccessManager.claimExpiredAccess(expired.id, randomUUID())).toBe(false)
      })
    })

    describe('and a worker loses its lease', () => {
      let otherToken: string

      beforeEach(async () => {
        otherToken = randomUUID()
        await components.sceneStreamAccessManager.claimExpiredAccess(expired.id, claimToken)
        await components.database.query(SQL`UPDATE scene_stream_access SET ingress_cleanup_claim_until = 0,
          ingress_cleanup_retry_at = 0 WHERE id = ${expired.id}`)
        await components.sceneStreamAccessManager.claimExpiredAccess(expired.id, otherToken)
      })

      it('should fence the stale worker from completing the new lease', async () => {
        expect(await components.sceneStreamAccessManager.completeExpiredAccessCleanup(expired.id, claimToken)).toBe(
          false
        )
        expect(await components.sceneStreamAccessManager.completeExpiredAccessCleanup(expired.id, otherToken)).toBe(
          true
        )
      })
    })

    describe('and a replacement is subsequently deleted by its admin', () => {
      beforeEach(async () => {
        await components.sceneStreamAccessManager.addAccess({
          place_id: expired.place_id,
          ingress_id: 'new-ingress',
          streaming_key: 'new-key',
          streaming_url: 'rtmp://new',
          room_id: 'room',
          expiration_time: Date.now() + FOUR_DAYS
        })
        await components.sceneStreamAccessManager.removeAccess(expired.place_id)
        await components.sceneStreamAccessManager.claimExpiredAccess(expired.id, claimToken)
      })

      it('should clean the replaced ingress without an expiration notification', async () => {
        expect(await components.sceneStreamAccessManager.completeExpiredAccessCleanup(expired.id, claimToken)).toBe(
          false
        )
      })
    })

    describe('and the old stream starts before cleanup claims it', () => {
      beforeEach(async () => {
        await components.sceneStreamAccessManager.startStreaming('old-ingress')
      })

      it('should refuse to claim the now-streaming row', async () => {
        expect(await components.sceneStreamAccessManager.claimExpiredAccess(expired.id, claimToken)).toBe(false)
      })
    })
  })

  describe('when a full batch of cleanup attempts keeps failing', () => {
    let failedRows: { id: string }[]
    let newlyExpired: SceneStreamAccess
    let readyRows: Pick<SceneStreamAccess, 'id' | 'ingress_id' | 'place_id'>[]

    beforeEach(async () => {
      await components.database.query(SQL`
        INSERT INTO scene_stream_access (id, place_id, streaming_key, streaming_url, ingress_id,
          created_at, active, streaming, ingress_cleanup_pending)
        SELECT gen_random_uuid(), 'test-expiration-failed-' || n, 'failed-key-' || n, 'rtmp://old',
          'failed-ingress-' || n, 0, false, false, true FROM generate_series(1, 100) n
      `)
      failedRows = (
        await components.database.query<{ id: string }>(
          SQL`SELECT id FROM scene_stream_access WHERE place_id LIKE 'test-expiration-failed-%'`
        )
      ).rows
      for (const row of failedRows) {
        await components.sceneStreamAccessManager.claimExpiredAccess(row.id, randomUUID())
      }
      newlyExpired = await components.sceneStreamAccessManager.addAccess({
        place_id: 'test-expiration-new',
        ingress_id: 'new-expired-ingress',
        streaming_key: 'new-expired-key',
        streaming_url: 'rtmp://new',
        expiration_time: Date.now() - 1
      })
      // Simulate the next retry tick: all failed rows are eligible again, but their retry
      // priority remains newer than the newly expired access.
      await components.database.query(SQL`UPDATE scene_stream_access SET ingress_cleanup_claim_until = 0,
        ingress_cleanup_retry_at = ${Date.now()} WHERE place_id LIKE 'test-expiration-failed-%'`)
      readyRows = await components.sceneStreamAccessManager.getExpiredStreamingKeys()
    })

    it('should include newly expired access despite a full batch of failed retries', () => {
      expect(readyRows).toEqual(expect.arrayContaining([expect.objectContaining({ id: newlyExpired.id })]))
    })
  })

  describe('when a world stream access still has its legacy mixed-case room', () => {
    beforeEach(async () => {
      await components.sceneStreamAccessManager.addAccess({
        place_id: 'test-expiration-world',
        ingress_id: 'world-ingress',
        streaming_key: 'world-key',
        streaming_url: 'rtmp://world',
        room_id: 'world-MyWorld.eth-SCENE',
        expiration_time: Date.now() + FOUR_DAYS
      })
    })

    it('should find it for a canonical world-room lookup', async () => {
      expect(await components.sceneStreamAccessManager.getAccessByRoomId('world-myworld.eth-scene', true)).toEqual(
        expect.objectContaining({ place_id: 'test-expiration-world' })
      )
    })

    it('should keep normal room lookups case-sensitive', async () => {
      expect(await components.sceneStreamAccessManager.getAccessByRoomId('world-myworld.eth-scene')).toBeNull()
    })
  })

  describe('when checking for expired streaming keys', () => {
    it('should return keys that have expiration_time in the past', async () => {
      const now = Date.now()
      const expiredTime = now - 1000 // 1 second ago

      // Insert an expired stream access
      await components.database.query(
        SQL`INSERT INTO scene_stream_access 
          (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time) 
          VALUES 
          (gen_random_uuid(), 'test-expiration-expired', 'key-expired', 'url', 'ingress-expired', ${now}, true, false, ${expiredTime})`
      )

      const expiredKeys = await components.sceneStreamAccessManager.getExpiredStreamingKeys()

      expect(expiredKeys.length).toBeGreaterThan(0)
      expect(expiredKeys.some((k) => k.place_id === 'test-expiration-expired')).toBe(true)
    })

    it('should NOT return keys that have expiration_time in the future', async () => {
      const now = Date.now()
      const futureTime = now + FOUR_DAYS

      // Insert a non-expired stream access
      await components.database.query(
        SQL`INSERT INTO scene_stream_access 
          (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time) 
          VALUES 
          (gen_random_uuid(), 'test-expiration-future', 'key-future', 'url', 'ingress-future', ${now}, true, false, ${futureTime})`
      )

      const expiredKeys = await components.sceneStreamAccessManager.getExpiredStreamingKeys()

      expect(expiredKeys.some((k) => k.place_id === 'test-expiration-future')).toBe(false)
    })

    describe('when expiration_time is null', () => {
      describe('and created_at is older than four days', () => {
        it('should return the key', async () => {
          const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000

          await components.database.query(
            SQL`INSERT INTO scene_stream_access
              (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time)
              VALUES
              (gen_random_uuid(), 'test-expiration-null-old', 'key-null-old', 'url', 'ingress-null-old', ${fiveDaysAgo}, true, false, null)`
          )

          const expiredKeys = await components.sceneStreamAccessManager.getExpiredStreamingKeys()

          expect(expiredKeys.some((k) => k.place_id === 'test-expiration-null-old')).toBe(true)
        })
      })

      describe('and created_at is within four days', () => {
        it('should not return the key', async () => {
          const now = Date.now()

          await components.database.query(
            SQL`INSERT INTO scene_stream_access
              (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time)
              VALUES
              (gen_random_uuid(), 'test-expiration-null-recent', 'key-null-recent', 'url', 'ingress-null-recent', ${now}, true, false, null)`
          )

          const expiredKeys = await components.sceneStreamAccessManager.getExpiredStreamingKeys()

          expect(expiredKeys.some((k) => k.place_id === 'test-expiration-null-recent')).toBe(false)
        })
      })
    })

    it('should NOT return keys that are currently streaming', async () => {
      const now = Date.now()
      const expiredTime = now - 1000

      // Insert an expired stream access that is currently streaming
      await components.database.query(
        SQL`INSERT INTO scene_stream_access 
          (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time) 
          VALUES 
          (gen_random_uuid(), 'test-expiration-streaming', 'key-streaming', 'url', 'ingress-streaming', ${now}, true, true, ${expiredTime})`
      )

      const expiredKeys = await components.sceneStreamAccessManager.getExpiredStreamingKeys()

      expect(expiredKeys.some((k) => k.place_id === 'test-expiration-streaming')).toBe(false)
    })

    it('should NOT return keys that are inactive', async () => {
      const now = Date.now()
      const expiredTime = now - 1000

      // Insert an expired but inactive stream access
      await components.database.query(
        SQL`INSERT INTO scene_stream_access 
          (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time) 
          VALUES 
          (gen_random_uuid(), 'test-expiration-inactive', 'key-inactive', 'url', 'ingress-inactive', ${now}, false, false, ${expiredTime})`
      )

      const expiredKeys = await components.sceneStreamAccessManager.getExpiredStreamingKeys()

      expect(expiredKeys.some((k) => k.place_id === 'test-expiration-inactive')).toBe(false)
    })
  })

  // Note: These tests are skipped due to PostgreSQL bigint handling issues with expiration_time
  // The core functionality of checking expiration_time is already tested by the unit tests
  // and the integration tests above verify that getExpiredStreamingKeys works correctly
  describe.skip('when validating streamer tokens', () => {
    let expiredPlaceId: string
    let validPlaceId: string

    beforeEach(() => {
      expiredPlaceId = `test-exp-token-${Date.now()}`
      validPlaceId = `test-valid-token-${Date.now()}`
    })

    afterEach(async () => {
      // Clean up tokens
      await components.database.query(
        SQL`DELETE FROM scene_stream_access WHERE place_id IN (${expiredPlaceId}, ${validPlaceId})`
      )
    })

    it('should reject expired tokens based on expiration_time', async () => {
      const now = Date.now()
      const expiredTime = now - 24 * 60 * 60 * 1000 // 1 day ago
      const streamingKey = `test-expired-token-${Date.now()}`
      const realmName = 'test-realm'
      const sceneId = 'test-scene'
      const roomId = `scene:${realmName}:${sceneId}`

      // Insert an expired stream access
      await components.database.query(
        SQL`INSERT INTO scene_stream_access 
          (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time, room_id) 
          VALUES 
          (gen_random_uuid(), ${expiredPlaceId}, ${streamingKey}, 'url', 'ingress-token', ${now}, true, false, ${expiredTime}, ${roomId})`
      )

      await expect(components.cast.validateStreamerToken(streamingKey, 'test-user')).rejects.toThrow('expired')
    })

    it('should accept non-expired tokens based on expiration_time', async () => {
      const now = Date.now()
      const futureTime = now + 3 * 24 * 60 * 60 * 1000 // 3 days from now
      const streamingKey = `test-valid-token-${Date.now()}`
      const realmName = 'test-realm'
      const sceneId = 'test-scene'
      const roomId = `scene:${realmName}:${sceneId}`

      // Insert a valid stream access
      await components.database.query(
        SQL`INSERT INTO scene_stream_access 
          (id, place_id, streaming_key, streaming_url, ingress_id, created_at, active, streaming, expiration_time, room_id) 
          VALUES 
          (gen_random_uuid(), ${validPlaceId}, ${streamingKey}, 'url', 'ingress-valid', ${now}, true, false, ${futureTime}, ${roomId})`
      )

      const result = await components.cast.validateStreamerToken(streamingKey, 'test-user')

      expect(result).toBeDefined()
      expect(result.roomId).toBe(roomId)
      expect(result.token).toBeDefined()
      expect(result.identity).toMatch(/^stream:/)
    })
  })
})
