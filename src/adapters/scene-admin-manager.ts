import { AppComponents } from '../types'
import SQL from 'sql-template-strings'
import * as Joi from 'joi'

export type SceneAdmin = {
  id: string
  entity_id: string
  admin: string
  owner: string
  added_by: string
  created_at: number
  active: boolean
}

export interface AddSceneAdminInput {
  entity_id: string
  admin: string
  owner: string
  added_by: string
}

export const addSceneAdminSchema = Joi.object<AddSceneAdminInput>().keys({
  entity_id: Joi.string().required(),
  admin: Joi.string().required().lowercase()
})

export type ListSceneAdminFilters = {
  entity_id?: string
  admin?: string
}

export interface ISceneAdminManager {
  addAdmin(input: AddSceneAdminInput): Promise<SceneAdmin>
  removeAdmin(entityId: string, admin: string): Promise<void>
  listActiveAdmins(filters: ListSceneAdminFilters): Promise<SceneAdmin[]>
  isAdmin(entityId: string, address: string): Promise<boolean>
}

export const listActiveAdminsSchema = Joi.object<{ entity_id?: string; admin?: string }>().keys({
  entity_id: Joi.string().optional(),
  admin: Joi.string().optional().lowercase()
})

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

  async function isAdmin(entityId: string, address: string): Promise<boolean> {
    const result = await database.query(
      SQL`SELECT id FROM scene_admin WHERE entity_id = ${entityId} AND admin = ${address} AND active = true LIMIT 1`
    )

    return result.rowCount > 0
  }

  async function addAdmin(input: AddSceneAdminInput): Promise<SceneAdmin> {
    const existingAdmin = await listActiveAdmins({
      entity_id: input.entity_id,
      admin: input.admin
    })

    if (existingAdmin.length > 0) {
      throw new DuplicateAdminError()
    }

    const result = await database.query<SceneAdmin>(
      SQL`INSERT INTO scene_admin (
            id,
            entity_id, 
            admin, 
            owner, 
            added_by,
            created_at,
            active
          )
          VALUES (
            gen_random_uuid(),
            ${input.entity_id},
            ${input.admin.toLowerCase()},
            ${input.owner.toLowerCase()},
            ${input.added_by.toLowerCase()},
            ${Date.now()},
            true
          )
          RETURNING *`
    )

    logger.info(`New admin created for entity ${input.entity_id}`)
    return result.rows[0]
  }

  async function removeAdmin(entityId: string, adminAddress: string): Promise<void> {
    await database.query(
      SQL`UPDATE scene_admin 
          SET active = false
          WHERE entity_id = ${entityId} 
          AND admin = ${adminAddress.toLowerCase()}
          AND active = true`
    )

    logger.info(`Admin ${adminAddress} deactivated for entity ${entityId}`)
  }

  async function listActiveAdmins(filters: { entity_id?: string; admin?: string }): Promise<SceneAdmin[]> {
    const query = SQL`
      SELECT * FROM scene_admin 
      WHERE active = true`

    if (filters.entity_id) {
      query.append(SQL` AND entity_id = ${filters.entity_id}`)
    }
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
