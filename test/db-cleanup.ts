import { IPgComponent } from '@well-known-components/pg-component'
import SQL from 'sql-template-strings'

export class TestCleanup {
  private entityIds: string[] = []
  private testIds: string[] = []
  constructor(private database: IPgComponent) {}

  trackId(id: string) {
    this.testIds.push(id)
  }

  trackEntityId(entityId: string) {
    this.entityIds.push(entityId)
  }

  async cleanup() {
    if (this.entityIds.length > 0) {
      await this.database.query(SQL`DELETE FROM scene_admin WHERE entity_id = ANY(${this.entityIds})`)
    }
    if (this.testIds.length > 0) {
      await this.database.query(SQL`DELETE FROM scene_admin WHERE id = ANY(${this.testIds})`)
    }
  }
}
