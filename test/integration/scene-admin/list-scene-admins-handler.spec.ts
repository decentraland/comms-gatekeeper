import { test } from '../../components'
import { getIdentity, makeRequest } from '../../utils'
import { TestCleanup } from '../../db-cleanup'
import SQL from 'sql-template-strings'

test('GET /scene-admin - lists all active administrators for scenes', ({ components }) => {
  let cleanup: TestCleanup
  const entityId = '0x123'
  const adminAddress = '0x3333333333333333333333333333333333333333'
  const ownerAddress = '0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5'

  beforeAll(async () => {
    cleanup = new TestCleanup(components.database)

    await components.database.query(SQL`
      DELETE FROM scene_admin 
      WHERE entity_id = ${entityId} AND admin = ${adminAddress.toLowerCase()}
    `)

    await components.database.query(SQL`
      INSERT INTO scene_admin (
        id, 
        entity_id, 
        admin, 
        owner, 
        added_by,
        created_at,
        active
      ) VALUES (
        gen_random_uuid(),
        ${entityId},
        ${adminAddress.toLowerCase()},
        ${ownerAddress.toLowerCase()},
        ${ownerAddress.toLowerCase()},
        ${Date.now()},
        true
      )
    `)
  })

  afterAll(async () => {
    await cleanup.cleanup()
  })

  it('returns 200 and a list of all administrators', async () => {
    const { localFetch } = components

    const response = await makeRequest(localFetch, '/scene-admin', {
      method: 'GET'
    })

    expect(response.status).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 200 and a filtered list when using query parameters', async () => {
    const { localFetch } = components

    const response = await makeRequest(localFetch, '/scene-admin?entity_id=0x123', {
      method: 'GET'
    })

    expect(response.status).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
    body.forEach((admin: any) => {
      expect(admin.entity_id).toBe('0x123')
    })
  })

  it('returns 400 when no authentication is provided', async () => {
    const { localFetch } = components

    const response = await localFetch.fetch('/scene-admin', {
      method: 'GET'
    })

    expect(response.status).toBe(400)
  })
})
