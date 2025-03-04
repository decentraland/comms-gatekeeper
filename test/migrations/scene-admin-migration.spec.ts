import { describe, expect, it, jest } from '@jest/globals'
import { MigrationBuilder } from 'node-pg-migrate'
import { SceneAdminColumns, up, down } from '../../src/migrations/1741025559300_scene-admin'

describe('Scene Admin Migration', () => {
  it('should create table with correct structure', async () => {
    const pgm = {
      createTable: jest.fn(),
      createIndex: jest.fn()
    }

    await up(pgm as unknown as MigrationBuilder)

    expect(pgm.createTable).toHaveBeenCalledWith('scene_admin', SceneAdminColumns)
    expect(pgm.createIndex).toHaveBeenCalledWith(
      'scene_admin',
      ['entity_id', 'admin'],
      expect.objectContaining({
        unique: true,
        where: 'active = true',
        name: 'unique_active_scene_admin_entity_id_admin'
      })
    )
  })

  it('should drop table on migration down', async () => {
    const pgm = {
      dropTable: jest.fn()
    }

    await down(pgm as unknown as MigrationBuilder)

    expect(pgm.dropTable).toHaveBeenCalledWith('scene_admin')
  })
})
