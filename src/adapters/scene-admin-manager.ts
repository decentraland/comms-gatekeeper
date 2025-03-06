import { AppComponents } from '../types'
import SQL from 'sql-template-strings'

export type SceneAdmin = {
  id: string
  place_id: string
  admin: string
  added_by: string
  created_at: number
  active: boolean
}

export interface AddSceneAdminInput {
  place_id: string
  admin: string
  added_by: string
}

export type ListSceneAdminFilters = {
  place_id: string
  admin?: string
}

export function validateAddSceneAdmin(input: any): { valid: boolean; error?: string } {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Input must be an object' }
  }

  if (!input.place_id) {
    return { valid: false, error: 'place_id is required' }
  }

  if (typeof input.place_id !== 'string') {
    return { valid: false, error: 'place_id must be a string' }
  }

  if (!input.admin) {
    return { valid: false, error: 'admin is required' }
  }

  if (typeof input.admin !== 'string') {
    return { valid: false, error: 'admin must be a string' }
  }

  return { valid: true }
}

export function validateListSceneAdminFilters(filters: any): { valid: boolean; error?: string } {
  if (!filters || typeof filters !== 'object') {
    return { valid: false, error: 'Filters must be an object' }
  }

  if (filters.place_id !== undefined && typeof filters.place_id !== 'string') {
    return { valid: false, error: 'place_id must be a string' }
  }

  if (filters.admin !== undefined && typeof filters.admin !== 'string') {
    return { valid: false, error: 'admin must be a string' }
  }

  return { valid: true }
}

export interface ISceneAdminManager {
  addAdmin(input: AddSceneAdminInput): Promise<SceneAdmin>
  removeAdmin(placeId: string, adminAddress: string): Promise<void>
  listActiveAdmins(filters: ListSceneAdminFilters): Promise<SceneAdmin[]>
  isAdmin(placeId: string, address: string): Promise<boolean>
}

export class DuplicateAdminError extends Error {
  constructor() {
    super('Admin already exists for this entity')
  }
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

  async function addAdmin(input: AddSceneAdminInput): Promise<SceneAdmin> {
    const validation = validateAddSceneAdmin(input)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    const existingAdmin = await listActiveAdmins({
      place_id: input.place_id,
      admin: input.admin
    })

    if (existingAdmin.length > 0) {
      throw new DuplicateAdminError()
    }

    const result = await database.query<SceneAdmin>(
      SQL`INSERT INTO scene_admin (
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
            ${input.admin.toLowerCase()},
            ${input.added_by.toLowerCase()},
            ${Date.now()},
            true
          )
          RETURNING *`
    )

    logger.info(`New admin created for entity ${input.place_id}`)
    return result.rows[0]
  }

  async function removeAdmin(placeId: string, adminAddress: string): Promise<void> {
    await database.query(
      SQL`UPDATE scene_admin 
          SET active = false
          WHERE place_id = ${placeId} 
          AND admin = ${adminAddress.toLowerCase()}
          AND active = true`
    )

    logger.info(`Admin ${adminAddress} deactivated for entity ${placeId}`)
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
