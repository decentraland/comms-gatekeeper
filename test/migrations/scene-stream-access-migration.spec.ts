import { describe, expect, it, jest } from '@jest/globals'
import { MigrationBuilder } from 'node-pg-migrate'
import { SceneStreamAccessColumns, up, down } from '../../src/migrations/1741630574473_scene-stream-access'

describe('Scene Stream Access Migration', () => {
  it('should create table with correct structure', async () => {
    const pgm = {
      createTable: jest.fn(),
      createIndex: jest.fn()
    }

    await up(pgm as unknown as MigrationBuilder)

    expect(pgm.createTable).toHaveBeenCalledWith('scene_stream_access', SceneStreamAccessColumns)
    expect(pgm.createIndex).toHaveBeenCalledWith(
      'scene_stream_access',
      ['place_id', 'active'],
      expect.objectContaining({
        name: 'unique_active_scene_stream_access_place_id',
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

    expect(pgm.dropIndex).toHaveBeenCalledWith('scene_stream_access', 'unique_active_scene_stream_access_place_id')
    expect(pgm.dropTable).toHaveBeenCalledWith('scene_stream_access')
  })
})
