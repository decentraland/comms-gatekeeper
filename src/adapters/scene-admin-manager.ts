import { AppComponents, SceneAdmin, AddSceneAdminInput, ListSceneAdminFilters, ISceneAdminManager } from '../types'
import SQL from 'sql-template-strings'

export function validateAddSceneAdmin(input: any): { valid: boolean; error?: string } {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    errors.push('Input must be an object')
  }
  if (typeof input.place_id !== 'string') {
    errors.push('place_id is required and must be a string')
  }
  if (typeof input.admin !== 'string') {
    errors.push('admin is required and must be a string')
  }
  return { valid: errors.length === 0, error: errors.join(', ') }
}

export function validateListSceneAdminFilters(filters: any): { valid: boolean; error?: string } {
  const errors: string[] = []

  if (!filters || typeof filters !== 'object') {
    errors.push('Filters must be an object')
  }
  if (filters.place_id !== undefined && typeof filters.place_id !== 'string') {
    errors.push('place_id must be a string')
  }
  if (filters.admin !== undefined && typeof filters.admin !== 'string') {
    errors.push('admin must be a string')
  }
  return { valid: errors.length === 0, error: errors.join(', ') }
}

export async function createSceneAdminManagerComponent({
  database,
  logs
}: Pick<AppComponents, 'database' | 'logs'>): Promise<ISceneAdminManager> {
  const logger = logs.getLogger('scene-admin-manager')

  async function isAdmin(placeId: string, address: string): Promise<boolean> {
    const result = await database.query(
      SQL`SELECT id FROM scene_admin WHERE place_id = ${placeId} AND admin = ${address.toLowerCase()} AND active = true LIMIT 1`
    )

    return result.rowCount > 0
  }

  async function addAdmin(input: AddSceneAdminInput): Promise<void> {
    const validation = validateAddSceneAdmin(input)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const adminLowercase = input.admin.toLowerCase()
    const addedByLowercase = input.added_by.toLowerCase()

    const result = await database.query<SceneAdmin>(
      SQL`
        INSERT INTO scene_admin (
          id,
          place_id, 
          admin, 
          added_by,
          created_at,
          active
        )
        VALUES (
          gen_random_uuid(),
          ${input.place_id},
          ${adminLowercase},
          ${addedByLowercase},
          ${Date.now()},
          true
        )
        ON CONFLICT (place_id, admin) WHERE active = true
        DO NOTHING
        RETURNING *;
      `
    )

    result.rowCount > 0
      ? logger.info(`New admin created (${adminLowercase}) for place ${input.place_id}`)
      : logger.info(`Admin already exists (${adminLowercase}) for place ${input.place_id}`)
    return
  }

  async function removeAdmin(placeId: string, adminAddress: string): Promise<void> {
    await database.query(
      SQL`UPDATE scene_admin 
          SET active = false
          WHERE place_id = ${placeId} 
          AND admin = ${adminAddress.toLowerCase()}
          AND active = true`
    )

    logger.info(`Admin ${adminAddress} deactivated for place ${placeId}`)
  }

  async function listActiveAdmins(filters: ListSceneAdminFilters): Promise<SceneAdmin[]> {
    const validation = validateListSceneAdminFilters(filters)

    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const query = SQL`
      SELECT * FROM scene_admin 
      WHERE active = true
      AND place_id = ${filters.place_id}`

    if (filters.admin) {
      query.append(SQL` AND admin = ${filters.admin.toLowerCase()}`)
    }

    const result = await database.query<SceneAdmin>(query)

    return result.rows
  }

  return {
    addAdmin,
    removeAdmin,
    listActiveAdmins,
    isAdmin
  }
}
