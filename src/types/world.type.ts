import { IBaseComponent } from '@well-known-components/interfaces'
import { PermissionsOverWorld } from '../types'

export type IWorldComponent = IBaseComponent & {
  fetchWorldActionPermissions(worldName: string): Promise<PermissionsOverWorld | undefined>
  hasWorldOwnerPermission(authAddress: string, worldName: string): Promise<boolean>
  hasWorldStreamingPermission(authAddress: string, worldName: string): Promise<boolean>
}
