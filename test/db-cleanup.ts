import { IPgComponent } from '@well-known-components/pg-component'
import SQL from 'sql-template-strings'

export class TestCleanup {
  private placeIds: string[] = []
  private tableData: Record<string, any[]> = {}

  constructor(private database: IPgComponent) {}

  trackInsert(tableName: string, data: Record<string, any>) {
    if (!this.tableData[tableName]) {
      this.tableData[tableName] = []
    }
    this.tableData[tableName].push(data)
  }

  async cleanup() {
    await this.cleanupTableData()
    await this.cleanupSceneAdmins()
    this.resetCollections()
  }

  private async cleanupTableData() {
    for (const tableName in this.tableData) {
      await Promise.all(this.tableData[tableName].map((data) => this.deleteFromTable(tableName, data)))
    }
  }

  private async deleteFromTable(tableName: string, data: Record<string, any>) {
    try {
      const conditions = Object.entries(data)
        .map(([key, value]) => `${key} = ${typeof value === 'string' ? `'${value}'` : value}`)
        .join(' AND ')

      const query = `DELETE FROM ${tableName} WHERE ${conditions}`
      await this.database.query(query)
    } catch (error) {
      console.error(` >>> Error cleaning data from ${tableName}:`, error)
    }
  }

  private async cleanupSceneAdmins() {
    if (this.placeIds.length === 0) return

    try {
      const placeIdsString = this.placeIds.map((id) => `'${id}'`).join(', ')
      await this.database.query(`DELETE FROM scene_admin WHERE place_id IN (${placeIdsString})`)
    } catch (error) {
      console.error(' >>>  Error cleaning scene administrators:', error)
    }
  }

  private resetCollections() {
    this.placeIds = []
    this.tableData = {}
  }
}
