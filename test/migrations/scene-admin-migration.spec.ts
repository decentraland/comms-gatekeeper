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
      ['place_id', 'admin'],
      expect.objectContaining({
        name: 'unique_active_scene_admin_place_id_admin',
        unique: true,
        where: 'active = true'
      })
    )
  })

  it('should drop table on migration down', async () => {
    const pgm = {
      dropTable: jest.fn(),
      dropIndex: jest.fn()
    }

    await down(pgm as unknown as MigrationBuilder)

    expect(pgm.dropIndex).toHaveBeenCalledWith('scene_admin', 'unique_active_scene_admin_place_id_admin')
    expect(pgm.dropTable).toHaveBeenCalledWith('scene_admin')
  })
})
