import { describe, expect, it, jest } from '@jest/globals'
import { MigrationBuilder } from 'node-pg-migrate'
import { StreamingAccessColumns, up, down } from '../../src/migrations/1741092907199_steaming-access'

describe('Streaming Access Migration', () => {
  it('should create table with correct structure', async () => {
    const pgm = {
      createTable: jest.fn(),
      createIndex: jest.fn()
    }

    await up(pgm as unknown as MigrationBuilder)

    expect(pgm.createTable).toHaveBeenCalledWith('streaming_access', StreamingAccessColumns)
    expect(pgm.createIndex).toHaveBeenCalledWith(
      'streaming_access',
      ['entity_id', 'stream_key'],
      expect.objectContaining({
        unique: true,
        where: 'active = true',
        name: 'unique_active_streaming_access_entity_id_stream_key'
      })
    )
  })

  it('should drop table on migration down', async () => {
    const pgm = {
      dropTable: jest.fn()
    }

    await down(pgm as unknown as MigrationBuilder)

    expect(pgm.dropTable).toHaveBeenCalledWith('streaming_access')
  })
})
